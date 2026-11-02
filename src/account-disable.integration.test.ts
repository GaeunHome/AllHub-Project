import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications } from "@/core/db/schema";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubAllEnv } from "@/dev/test-env";
import { mocksOf } from "@/dev/test-helpers";
import { remindersItems } from "@/modules/reminders/data/schema";
import { savingsAccounts, savingsHoldings, savingsRecurring, savingsTransactions } from "@/modules/savings/data/schema";
import { twitchFollows, twitchStreamers } from "@/modules/twitch/data/schema";
import { weatherSettings } from "@/modules/weather/data/schema";
import { youtubeChannels, youtubeFollows, youtubeSavedVideos } from "@/modules/youtube/data/schema";

// 停用就是凍結 notify 不寫給他 追蹤與訂閱照樣保留 固定收支不記 除權息 下雨 警特報與生活提醒也不寄
// core 不能 import 模組 所以跨模組的檢查放在 src 底下

stubAllEnv();

vi.mock("@/modules/twitch/lib/api", { spy: true });
vi.mock("@/modules/youtube/lib/api", { spy: true });
vi.mock("@/modules/youtube/lib/subtitles/captions", { spy: true });

const twitchApi = mocksOf(await import("@/modules/twitch/lib/api"), "getStreams", "listSubscriptions", "createSubscription", "deleteSubscription");
const youtubeApi = mocksOf(await import("@/modules/youtube/lib/api"), "hubRequest", "checkIsShort");
const { listCaptionTracks } = mocksOf(await import("@/modules/youtube/lib/subtitles/captions"), "listCaptionTracks");
const { handleNotification, syncSubscriptions } = await import("@/modules/twitch/service/streamers");
const { handleFeed, renewSubscriptions } = await import("@/modules/youtube/service/channels");
const { postDueRecurring } = await import("@/modules/savings/service/recurring");
const { sendDividendNotices } = await import("@/modules/savings/service/dividend-notices");
const { sendRainAlerts } = await import("@/modules/weather/service/rain-alerts");
const { sendWarningAlerts } = await import("@/modules/weather/service/warning-alerts");
const { sendDailyReminders } = await import("@/modules/reminders/service/daily");
const { setUserDisabled } = await import("@/core/admin/service");

const getDb = setupTestDb();
const SHARED_CH = "UC" + "a".repeat(22);
const MEMBER_ONLY_CH = "UC" + "b".repeat(22);
const onlineSub = { id: "sub-on", type: "stream.online", version: "1", status: "enabled", condition: { broadcaster_user_id: "42" } };
const onlineEvent = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-08T09:00:00Z" };

let owner: string;
let member: string;

const notificationsOf = async (userId: string) => (await getDb().select().from(coreNotifications).where(eq(coreNotifications.userId, userId))).map((n) => n.module);

beforeEach(async () => {
  [owner, member] = await insertTestUsers(getDb());
  twitchApi.getStreams.mockReset().mockResolvedValue([{ user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" }]);
  twitchApi.listSubscriptions.mockReset().mockResolvedValue([]);
  twitchApi.createSubscription.mockReset().mockImplementation(async (type: string, broadcasterId: string) => ({ id: `${type}-${broadcasterId}`, type, status: "enabled" }));
  twitchApi.deleteSubscription.mockReset().mockResolvedValue(undefined);
  youtubeApi.hubRequest.mockReset().mockResolvedValue(undefined);
  youtubeApi.checkIsShort.mockReset().mockResolvedValue(false);
  listCaptionTracks.mockReset().mockResolvedValue({ ok: true, tracks: [] });

  const [shared, memberOnly] = await getDb()
    .insert(twitchStreamers)
    .values([
      { broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-42", offlineSubscriptionId: "off-42", subscriptionStatus: "enabled" },
      { broadcasterId: "43", login: "bobby", displayName: "Bobby", onlineSubscriptionId: "on-43", offlineSubscriptionId: "off-43", subscriptionStatus: "enabled" },
    ])
    .returning();
  await getDb().insert(twitchFollows).values([
    { userId: owner, streamerId: shared.id },
    { userId: member, streamerId: shared.id },
    { userId: member, streamerId: memberOnly.id },
  ]);
  await getDb().insert(youtubeChannels).values([
    { channelId: SHARED_CH, title: "뉴진스", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) },
    { channelId: MEMBER_ONLY_CH, title: "別的頻道", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) },
  ]);
  await getDb().insert(youtubeFollows).values([
    { userId: owner, channelId: SHARED_CH },
    { userId: member, channelId: SHARED_CH },
    { userId: member, channelId: MEMBER_ONLY_CH },
  ]);
});

describe("停用＝凍結：資料全部保留，只是排程與通知不處理他", () => {
  it("停用的人追蹤的主播開台、頻道發新影片都不寫通知給他，其他追蹤者照常；恢復後照常收到", async () => {
    await setUserDisabled(owner, member, true);

    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    await handleFeed([{ videoId: "newvideo001", channelId: SHARED_CH, title: "새 영상", published: new Date(), url: "", isShort: false }]);

    expect(await notificationsOf(member)).toEqual([]);
    expect((await notificationsOf(owner)).sort()).toEqual(["twitch", "youtube"]);

    await setUserDisabled(owner, member, false);
    await handleNotification("m2", onlineSub as never, onlineEvent as never);

    expect(await notificationsOf(member)).toEqual(["twitch"]);
  });

  it("追蹤名單、保留的影片與共用的訂閱都保留：只有他追蹤的主播與頻道，同步與續訂排程不會刪掉，恢復後不用重建", async () => {
    await getDb().insert(youtubeSavedVideos).values({ userId: member, videoId: "dQw4w9WgXcQ", title: "影片", pinned: false });
    await setUserDisabled(owner, member, true);

    await syncSubscriptions();
    await renewSubscriptions();

    expect((await getDb().select().from(twitchStreamers)).map((s) => s.login).sort()).toEqual(["alice", "bobby"]);
    expect((await getDb().select().from(youtubeChannels)).map((c) => c.channelId).sort()).toEqual([SHARED_CH, MEMBER_ONLY_CH]);
    expect(await getDb().select().from(twitchFollows).where(eq(twitchFollows.userId, member))).toHaveLength(2);
    expect(await getDb().select().from(youtubeFollows).where(eq(youtubeFollows.userId, member))).toHaveLength(2);
    expect(await getDb().select().from(youtubeSavedVideos).where(eq(youtubeSavedVideos.userId, member))).toHaveLength(1);
    expect(twitchApi.deleteSubscription).not.toHaveBeenCalled();
    expect(youtubeApi.hubRequest.mock.calls.filter(([mode]) => mode === "unsubscribe")).toEqual([]);
  });

  it("理財的固定收支：停用的人不自動記帳、記到的月份也不往前推，其他人照常；恢復後補記停用期間的月份", async () => {
    // 台北時間 2026-10-14 中午 帳戶與固定收支都是 9/1 建立 每月 6 日
    // 開始記帳之前的日期不記
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
    await setUserDisabled(owner, member, true);

    expect(await postDueRecurring(now)).toBe("自動記帳 2 筆");

    expect(await datesOf(owner)).toEqual(["2026-09-06", "2026-10-06"]);
    expect(await datesOf(member)).toEqual([]);
    expect((await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, memberRule.id)))[0].lastPostedMonth).toBeNull();

    await setUserDisabled(owner, member, false);
    expect(await postDueRecurring(now)).toBe("自動記帳 2 筆");

    expect(await datesOf(member)).toEqual(["2026-09-06", "2026-10-06"]);
  });

  it("理財的除權息通知：停用的人收不到、也不記下寄過，持有同一檔的其他人照常；恢復後照常收到", async () => {
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
    await getDb()
      .insert(savingsHoldings)
      .values([
        { userId: owner, accountId: ownerBroker.id, symbol: "006208", name: "富邦台50", shares: 1000, cost: 100_000 },
        { userId: member, accountId: memberBroker.id, symbol: "006208", name: "富邦台50", shares: 300, cost: 30_000 },
      ]);
    await setUserDisabled(owner, member, true);

    expect(await sendDividendNotices(morning)).toBe("寄出 1 則除權息通知");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["savings"]);

    await setUserDisabled(owner, member, false);
    expect(await sendDividendNotices(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則除權息通知");
    expect(await notificationsOf(member)).toEqual(["savings"]);
  });

  it("天氣的下雨提醒：停用的人收不到，同縣市的其他人照常；恢復後照常收到", async () => {
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
    await setUserDisabled(owner, member, true);

    expect(await sendRainAlerts(morning)).toBe("寄出 1 則下雨提醒");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["weather"]);

    await setUserDisabled(owner, member, false);
    expect(await sendRainAlerts(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則下雨提醒，1 人今天已經提醒過");
    expect(await notificationsOf(member)).toEqual(["weather"]);
  });

  it("天氣警特報：停用的人收不到，同縣市的其他人照常；恢復後照常收到", async () => {
    // 台北 11/2 早上 10 點 照氣象署 W-C0033-001 的格式手寫 21 點才結束
    const morning = new Date("2026-11-02T02:00:00Z");
    const warning = { records: { location: [{ locationName: "臺北市", hazardConditions: { hazards: [{ info: { phenomena: "大雨", significance: "特報" }, validTime: { startTime: "2026-11-02 08:00:00", endTime: "2026-11-02 21:00:00" } }] } }] } };
    vi.stubGlobal("fetch", fakeFetch(() => Response.json(warning)).impl);
    await getDb().insert(weatherSettings).values([
      { userId: owner, county: "臺北市" },
      { userId: member, county: "臺北市" },
    ]);
    await setUserDisabled(owner, member, true);

    expect(await sendWarningAlerts(morning)).toBe("寄出 1 則天氣警特報通知");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["weather"]);

    await setUserDisabled(owner, member, false);
    expect(await sendWarningAlerts(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則天氣警特報通知，1 則今天已經提醒過");
    expect(await notificationsOf(member)).toEqual(["weather"]);
  });

  it("提醒與倒數：停用的人不寄提醒、過期的也不刪，其他人照常；恢復後下一次排程才處理", async () => {
    // 台北 11/2 早上 7 點 10 分 UTC 還是 11/1
    const morning = new Date("2026-11-01T23:10:00Z");
    await getDb().insert(remindersItems).values([
      { userId: owner, title: "站長今天", date: "2026-11-02", notifyDaysBefore: 0 },
      { userId: owner, title: "站長過期", date: "2026-11-01", notifyDaysBefore: 0 },
      { userId: member, title: "成員今天", date: "2026-11-02", notifyDaysBefore: 0 },
      { userId: member, title: "成員過期", date: "2026-11-01", notifyDaysBefore: 0 },
    ]);
    const titlesOf = async (userId: string) => (await getDb().select().from(remindersItems).where(eq(remindersItems.userId, userId))).map((item) => item.title).sort();
    await setUserDisabled(owner, member, true);

    expect(await sendDailyReminders(morning)).toBe("寄出 1 則提醒，刪除 1 個過期的提醒");
    expect(await notificationsOf(member)).toEqual([]);
    expect(await notificationsOf(owner)).toEqual(["reminders"]);
    expect(await titlesOf(member)).toEqual(["成員今天", "成員過期"].sort());
    expect(await titlesOf(owner)).toEqual(["站長今天"]);

    await setUserDisabled(owner, member, false);
    expect(await sendDailyReminders(new Date(morning.getTime() + 30 * 60_000))).toBe("寄出 1 則提醒，1 則今天已經寄過，刪除 1 個過期的提醒");
    expect(await notificationsOf(member)).toEqual(["reminders"]);
    expect(await titlesOf(member)).toEqual(["成員今天"]);
  });
});
