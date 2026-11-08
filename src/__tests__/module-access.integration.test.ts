import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/core/crypto";
import { coreModuleDenials, coreNotifications } from "@/core/db/schema";
import { taipeiDateKey } from "@/core/time";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { TEST_CORE_ENV, stubAllEnv } from "@/dev/test-env";
import { form, mocksOf } from "@/dev/test-helpers";
import { remindersItems } from "@/modules/reminders/data/schema";
import { savingsAccounts, savingsHoldings, savingsRecurring, savingsTransactions } from "@/modules/savings/data/schema";
import { starrailAccounts } from "@/modules/starrail/data/schema";
import { twitchFollows, twitchStreamers } from "@/modules/twitch/data/schema";
import { weatherSettings } from "@/modules/weather/data/schema";
import { youtubeAiKeys, youtubeChannels, youtubeFollows } from "@/modules/youtube/data/schema";

// 關掉模組等於凍結 同停用帳號 資料保留 恢復後照常
// core 不能 import 模組 所以跨模組的檢查放在 src 底下

stubAllEnv();

const request = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://hub.example.com", host: "hub.example.com" }),
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("@/modules/twitch/lib/api", { spy: true });
vi.mock("@/modules/youtube/lib/api", { spy: true });

const twitchApi = mocksOf(await import("@/modules/twitch/lib/api"), "getStreams", "listSubscriptions", "createSubscription", "deleteSubscription");
const youtubeApi = mocksOf(await import("@/modules/youtube/lib/api"), "hubRequest", "checkIsShort");
const { handleNotification, syncSubscriptions } = await import("@/modules/twitch/service/streamers");
const { handleFeed, renewSubscriptions } = await import("@/modules/youtube/service/channels");
const { reencryptApiKeys } = await import("@/modules/youtube/service/ai-settings");
const { postDueRecurring } = await import("@/modules/savings/service/recurring");
const { sendDividendNotices } = await import("@/modules/savings/service/dividend-notices");
const { sendRainAlerts } = await import("@/modules/weather/service/rain-alerts");
const { sendWarningAlerts } = await import("@/modules/weather/service/warning-alerts");
const { sendDailyReminders } = await import("@/modules/reminders/service/daily");
const { listAccounts } = await import("@/modules/starrail/service/accounts");
const { reencryptCookies } = await import("@/modules/starrail/service/maintenance");
const { setModuleAccess } = await import("@/core/admin/service");
const { setModuleAccessAction } = await import("@/core/admin/actions");
const { InviteSection, ModuleAccessSection, UserSection } = await import("@/core/admin/admin-page");
const { notify } = await import("@/core/notify");
const { SESSION_COOKIE, signSession } = await import("@/core/auth/session");

const getDb = setupTestDb();
const SRC = fileURLToPath(new URL("..", import.meta.url));
const moduleIds = fs
  .readdirSync(path.join(SRC, "modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
  .map((entry) => entry.name);

const CHANNEL = "UC" + "a".repeat(22);
const onlineSub = { id: "sub-on", type: "stream.online", version: "1", status: "enabled", condition: { broadcaster_user_id: "42" } };
const onlineEvent = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-08T09:00:00Z" };

let owner: string;
let member: string;

const deny = (userId: string, moduleId: string) => setModuleAccess(userId, moduleId, false);
const allow = (userId: string, moduleId: string) => setModuleAccess(userId, moduleId, true);
const loginAs = async (userId: string) => request.jar.set(SESSION_COOKIE, await signSession({ userId, version: 1 }, TEST_CORE_ENV.SESSION_SECRET));
const notificationsOf = async (userId: string) => (await getDb().select().from(coreNotifications).where(eq(coreNotifications.userId, userId))).map((n) => n.module);

beforeEach(async () => {
  request.jar.clear();
  [owner, member] = await insertTestUsers(getDb());
  twitchApi.getStreams.mockReset().mockResolvedValue([{ user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" }]);
  twitchApi.listSubscriptions.mockReset().mockResolvedValue([]);
  twitchApi.createSubscription.mockReset().mockImplementation(async (type: string, broadcasterId: string) => ({ id: `${type}-${broadcasterId}`, type, status: "enabled" }));
  twitchApi.deleteSubscription.mockReset().mockResolvedValue(undefined);
  youtubeApi.hubRequest.mockReset().mockResolvedValue(undefined);
  youtubeApi.checkIsShort.mockReset().mockResolvedValue(false);
});

describe("被關掉模組的人直接 POST Server Action", () => {
  it.each(moduleIds)("%s：每一個 Server Action 都導回首頁", async (id) => {
    const actions = (await import(pathToFileURL(path.join(SRC, "modules", id, "web/actions.ts")).href)) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const names = Object.keys(actions).filter((name) => typeof actions[name] === "function");
    await deny(member, id);
    await loginAs(member);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) await expect(actions[name]({}, new FormData()), name).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
  });

  it("擋下來時什麼都沒寫入；恢復後同一個動作照常", async () => {
    const { createReminderAction } = await import("@/modules/reminders/web/actions");
    const nextWeek = taipeiDateKey(new Date(Date.now() + 7 * 86_400_000));
    const fields = form({ title: "繳房屋稅", date: nextWeek, notifyDaysBefore: "0" });
    await deny(member, "reminders");
    await loginAs(member);

    await expect(createReminderAction({}, fields)).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    expect(await getDb().select().from(remindersItems)).toEqual([]);

    await allow(member, "reminders");
    expect((await createReminderAction({}, fields)).error).toBeUndefined();
    expect((await getDb().select().from(remindersItems)).map((item) => item.userId)).toEqual([member]);
  });
});

describe("權限只有站長能改", () => {
  const fields = () => form({ userId: member, moduleId: "savings", allowed: "false" });

  it("站長_寫入，被改的人立刻不能用", async () => {
    await loginAs(owner);

    await setModuleAccessAction({}, fields());

    const { requireModule } = await import("@/core/auth");
    await loginAs(member);
    await expect(requireModule("savings")).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
  });

  it("成員_導回首頁，改不了別人也改不了自己", async () => {
    await loginAs(member);

    await expect(setModuleAccessAction({}, fields())).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    await expect(setModuleAccessAction({}, form({ userId: owner, moduleId: "savings", allowed: "false" }))).rejects.toThrow(/^NEXT_REDIRECT:\/$/);

    const { requireModule } = await import("@/core/auth");
    expect(await requireModule("savings")).toMatchObject({ id: member });
  });

  it("沒登入_導向登入頁", async () => {
    await expect(setModuleAccessAction({}, fields())).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("成員打開 /admin_每一區都導回首頁，看不到權限表格", async () => {
    await loginAs(member);

    await expect(ModuleAccessSection({ modules: [] })).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    await expect(UserSection()).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    await expect(InviteSection({ modules: [] })).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
  });
});

describe("關掉模組＝那個模組凍結：資料全部保留，只是排程與通知不處理他", () => {
  async function followers() {
    const [streamer] = await getDb()
      .insert(twitchStreamers)
      .values({ broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-42", offlineSubscriptionId: "off-42", subscriptionStatus: "enabled" })
      .returning();
    await getDb().insert(twitchFollows).values([
      { userId: owner, streamerId: streamer.id },
      { userId: member, streamerId: streamer.id },
    ]);
    await getDb().insert(youtubeChannels).values({ channelId: CHANNEL, title: "뉴진스", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) });
    await getDb().insert(youtubeFollows).values([
      { userId: owner, channelId: CHANNEL },
      { userId: member, channelId: CHANNEL },
    ]);
  }

  it("notify 跳過對那個模組沒權限的收件人：別的模組照常，其他收件人照常，恢復後照常", async () => {
    await deny(member, "twitch");

    await notify({ recipients: [owner, member], module: "twitch", kind: "demo", title: "開台了" });
    await notify({ recipients: [member], module: "youtube", kind: "demo", title: "新影片" });

    expect(await notificationsOf(owner)).toEqual(["twitch"]);
    expect(await notificationsOf(member)).toEqual(["youtube"]);

    await allow(member, "twitch");
    await notify({ recipients: [member], module: "twitch", kind: "demo", title: "又開台了" });
    expect((await notificationsOf(member)).sort()).toEqual(["twitch", "youtube"]);
  });

  it("站長一律收得到：就算資料庫裡有紀錄", async () => {
    await getDb().insert(coreModuleDenials).values({ userId: owner, moduleId: "twitch" });

    await notify({ recipients: [owner], module: "twitch", kind: "demo", title: "開台了" });

    expect(await notificationsOf(owner)).toEqual(["twitch"]);
  });

  it("Twitch 與 YouTube：主播開台、頻道發新影片都不寫給他，其他追蹤者照常", async () => {
    await followers();
    await deny(member, "twitch");
    await deny(member, "youtube");

    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    await handleFeed([{ videoId: "newvideo001", channelId: CHANNEL, title: "새 영상", published: new Date(), url: "", isShort: false }]);

    expect(await notificationsOf(member)).toEqual([]);
    expect((await notificationsOf(owner)).sort()).toEqual(["twitch", "youtube"]);
  });

  it("不算沒人追蹤：只有他追蹤的主播與頻道，同步與續訂排程不會刪掉，恢復後不用重建", async () => {
    const [streamer] = await getDb()
      .insert(twitchStreamers)
      .values({ broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-42", offlineSubscriptionId: "off-42", subscriptionStatus: "enabled" })
      .returning();
    await getDb().insert(twitchFollows).values({ userId: member, streamerId: streamer.id });
    await getDb().insert(youtubeChannels).values({ channelId: CHANNEL, title: "뉴진스", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) });
    await getDb().insert(youtubeFollows).values({ userId: member, channelId: CHANNEL });
    await deny(member, "twitch");
    await deny(member, "youtube");

    await syncSubscriptions();
    await renewSubscriptions();

    expect(await getDb().select().from(twitchStreamers)).toHaveLength(1);
    expect(await getDb().select().from(youtubeChannels)).toHaveLength(1);
    expect(await getDb().select().from(twitchFollows).where(eq(twitchFollows.userId, member))).toHaveLength(1);
    expect(await getDb().select().from(youtubeFollows).where(eq(youtubeFollows.userId, member))).toHaveLength(1);
    expect(twitchApi.deleteSubscription).not.toHaveBeenCalled();
    expect(youtubeApi.hubRequest.mock.calls.filter(([mode]) => mode === "unsubscribe")).toEqual([]);
  });

  it("星穹鐵道：排程（簽到、開拓力與提醒、自動兌換）都從 listAccounts 來，不列他的帳號；恢復後照常", async () => {
    await getDb().insert(starrailAccounts).values([
      { userId: owner, ltuid: "1", cookieEncrypted: "v1:x", uid: "800000001", region: "prod_official_asia" },
      { userId: member, ltuid: "2", cookieEncrypted: "v1:y", uid: "800000002", region: "prod_official_asia" },
    ]);
    const owners = async () => (await listAccounts()).map((account) => account.userId);
    await deny(member, "starrail");

    expect(await owners()).toEqual([owner]);

    await allow(member, "starrail");
    expect(await owners()).toEqual([owner, member]);
  });

  it("理財的固定收支：不自動記帳、記到的月份也不往前推，其他人照常；恢復後補記關掉期間的月份", async () => {
    // 台北時間 2026-10-14 中午 帳戶與固定收支都是 9/1 建立 每月 6 日
    const now = new Date("2026-10-14T04:00:00Z");
    const createdAt = new Date("2026-09-01T04:00:00Z");
    const [ownerAccount, memberAccount] = await getDb()
      .insert(savingsAccounts)
      .values([
        { userId: owner, name: "國泰", kind: "deposit", createdAt },
        { userId: member, name: "郵局", kind: "deposit", createdAt },
      ])
      .returning();
    const [, memberRule] = await getDb()
      .insert(savingsRecurring)
      .values([
        { userId: owner, kind: "expense", accountId: ownerAccount.id, amount: 390, dayOfMonth: 6, createdAt },
        { userId: member, kind: "expense", accountId: memberAccount.id, amount: 390, dayOfMonth: 6, createdAt },
      ])
      .returning();
    const datesOf = async (userId: string) => (await getDb().select().from(savingsTransactions).where(eq(savingsTransactions.userId, userId))).map((t) => t.date).sort();
    await deny(member, "savings");

    expect(await postDueRecurring(now)).toBe("自動記帳 2 筆");

    expect(await datesOf(owner)).toEqual(["2026-09-06", "2026-10-06"]);
    expect(await datesOf(member)).toEqual([]);
    expect((await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, memberRule.id)))[0].lastPostedMonth).toBeNull();

    await allow(member, "savings");
    expect(await postDueRecurring(now)).toBe("自動記帳 2 筆");

    expect(await datesOf(member)).toEqual(["2026-09-06", "2026-10-06"]);
  });

  it("理財的除權息通知：收不到、也不記下寄過，持有同一檔的其他人照常；恢復後照常收到", async () => {
    // 台北 10/29 早上 8 點多 006208 11/18 除息每股 1.72 元 照證交所 TWT48U_ALL 的格式手寫
    const morning = new Date("2026-10-29T00:10:00Z");
    const rows = [{ Date: "1151118", Code: "006208", Name: "富邦台50", Exdividend: "息", StockDividendRatio: "", CashDividend: "1.720000" }];
    vi.stubGlobal("fetch", fakeFetch(({ url }) => Response.json(url.includes("TWT48U_ALL") ? rows : [])).impl);
    const [ownerBroker, memberBroker] = await getDb()
      .insert(savingsAccounts)
      .values([
        { userId: owner, name: "元大證券", kind: "investment" },
        { userId: member, name: "富邦證券", kind: "investment" },
      ])
      .returning();
    await getDb().insert(savingsHoldings).values([
      { userId: owner, accountId: ownerBroker.id, symbol: "006208", name: "富邦台50", shares: 1000, cost: 100_000 },
      { userId: member, accountId: memberBroker.id, symbol: "006208", name: "富邦台50", shares: 300, cost: 30_000 },
    ]);
    await deny(member, "savings");

    expect(await sendDividendNotices(morning)).toBe("寄出 1 則除權息通知");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["savings"]);

    await allow(member, "savings");
    expect(await sendDividendNotices(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則除權息通知");
    expect(await notificationsOf(member)).toEqual(["savings"]);
  });

  it("天氣的下雨提醒：收不到，同縣市的其他人照常；恢復後照常收到", async () => {
    // 台北 10/19 早上 6 點 10 分 今天白天降雨機率 80% 照氣象署 F-C0032-001 的格式手寫
    const morning = new Date("2026-10-18T22:10:00Z");
    const periods = [
      ["2026-10-19T06:00:00+08:00", "2026-10-19T18:00:00+08:00", "陰短暫雨", "80"],
      ["2026-10-19T18:00:00+08:00", "2026-10-20T06:00:00+08:00", "多雲", "30"],
    ];
    const element = (elementName: string, pick: (period: string[]) => string) => ({ elementName, time: periods.map((period) => ({ startTime: period[0], endTime: period[1], parameter: { parameterName: pick(period) } })) });
    const forecast = { records: { location: [{ locationName: "臺北市", weatherElement: [element("Wx", (p) => p[2]), element("PoP", (p) => p[3]), element("MinT", () => "21"), element("CI", () => "舒適"), element("MaxT", () => "26")] }] } };
    vi.stubGlobal("fetch", fakeFetch(() => Response.json(forecast)).impl);
    await getDb().insert(weatherSettings).values([
      { userId: owner, county: "臺北市" },
      { userId: member, county: "臺北市" },
    ]);
    await deny(member, "weather");

    expect(await sendRainAlerts(morning)).toBe("寄出 1 則下雨提醒");
    expect(await notificationsOf(member)).toEqual([]);

    await allow(member, "weather");
    expect(await sendRainAlerts(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則下雨提醒，1 人今天已經提醒過");
    expect(await notificationsOf(member)).toEqual(["weather"]);
  });

  it("天氣警特報：收不到，同縣市的其他人照常", async () => {
    // 台北 11/2 早上 10 點 照氣象署 W-C0033-001 的格式手寫 21 點才結束
    const morning = new Date("2026-11-02T02:00:00Z");
    const warning = { records: { location: [{ locationName: "臺北市", hazardConditions: { hazards: [{ info: { phenomena: "大雨", significance: "特報" }, validTime: { startTime: "2026-11-02 08:00:00", endTime: "2026-11-02 21:00:00" } }] } }] } };
    vi.stubGlobal("fetch", fakeFetch(() => Response.json(warning)).impl);
    await getDb().insert(weatherSettings).values([
      { userId: owner, county: "臺北市" },
      { userId: member, county: "臺北市" },
    ]);
    await deny(member, "weather");

    expect(await sendWarningAlerts(morning)).toBe("寄出 1 則天氣警特報通知");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["weather"]);
  });

  it("提醒與倒數：不寄提醒、過期的也不刪，其他人照常；恢復後下一次排程才處理", async () => {
    // 台北 11/2 早上 7 點 10 分 UTC 還是 11/1
    const morning = new Date("2026-11-01T23:10:00Z");
    await getDb().insert(remindersItems).values([
      { userId: owner, title: "站長今天", date: "2026-11-02", notifyDaysBefore: 0 },
      { userId: owner, title: "站長過期", date: "2026-11-01", notifyDaysBefore: 0 },
      { userId: member, title: "成員今天", date: "2026-11-02", notifyDaysBefore: 0 },
      { userId: member, title: "成員過期", date: "2026-11-01", notifyDaysBefore: 0 },
    ]);
    const titlesOf = async (userId: string) => (await getDb().select().from(remindersItems).where(eq(remindersItems.userId, userId))).map((item) => item.title).sort();
    await deny(member, "reminders");

    expect(await sendDailyReminders(morning)).toBe("寄出 1 則提醒，刪除 1 個過期的提醒");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await titlesOf(member)).toEqual(["成員今天", "成員過期"].sort());

    await allow(member, "reminders");
    expect(await sendDailyReminders(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則提醒，1 則今天已經寄過，刪除 1 個過期的提醒");
    expect(await notificationsOf(member)).toEqual(["reminders"]);
    expect(await titlesOf(member)).toEqual(["成員今天"]);
  });

  it("重新加密排程例外：被關掉的人的 cookie 與 API Key 照樣處理，移除舊金鑰前要全部換好", async () => {
    await getDb().insert(starrailAccounts).values({ userId: member, ltuid: "2", cookieEncrypted: encryptSecret("ltoken_v2=x"), uid: "800000002", region: "prod_official_asia" });
    await getDb().insert(youtubeAiKeys).values({ userId: member, provider: "anthropic", apiKey: encryptSecret("sk-test") });
    await deny(member, "starrail");
    await deny(member, "youtube");

    expect(await reencryptCookies()).toContain("1 筆 cookie");
    expect(await reencryptApiKeys()).toContain("1 把 API Key");
  });

  it("換模組不影響其他模組的排程：只關掉天氣，理財照常", async () => {
    const createdAt = new Date("2026-09-01T04:00:00Z");
    const [account] = await getDb().insert(savingsAccounts).values({ userId: member, name: "郵局", kind: "deposit", createdAt }).returning();
    await getDb().insert(savingsRecurring).values({ userId: member, kind: "expense", accountId: account.id, amount: 390, dayOfMonth: 6, createdAt });
    await deny(member, "weather");

    expect(await postDueRecurring(new Date("2026-09-14T04:00:00Z"))).toBe("自動記帳 1 筆");
  });
});
