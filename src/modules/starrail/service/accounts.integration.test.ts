import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreUsers } from "@/core/db/schema";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, expiredTags, loggedText, mocksOf, resetNextCache } from "@/dev/test-helpers";
import { starrailAccounts, starrailCheckinLogs } from "../data/schema";
import { COOKIE, dailyNote, hoyolab, ok, role } from "../dev/fixtures";

vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab);
vi.mock("@/core/notify", { spy: true });

stubCoreEnv();

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const accounts = await import("./accounts");
const link = await import("./link");
const checkins = await import("./checkin");
const { checkStaminaAll, getDailyNote } = await import("./stamina");
const { cleanupCheckinLogs } = await import("./maintenance");
const { checkin, checkinAll } = checkins;

// 台北週三中午 不是每日實訓 每週內容或終局挑戰的提醒時段 這裡只看開拓力
const NOON = new Date("2026-10-21T04:00:00Z");
const twoRoles = [role({ nickname: "A" }), role({ uid: "800000002", nickname: "B", region: "prod_official_asia", level: 40 })];
const note = (stamina: number) => dailyNote({ stamina });

const getDb = setupTestDb();
let me: string;
let other: string;

/** 沒特別說的都是 me 在操作 */
const linkAccount = (cookie: string, selection?: Parameters<typeof link.linkAccount>[2]) => link.linkAccount(me, cookie, selection);
const checkinAccount = (id: number) => checkins.checkinAccount(me, id);

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  notify.mockReset().mockResolvedValue(undefined);
  hoyolab.fetchGameRoles.mockResolvedValue(ok(twoRoles));
});

describe("linkAccount（PGlite 整合）", () => {
  it("一個 cookie 兩個角色_各存一列_cookie 只存密文_重貼不重複", async () => {
    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });
    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });

    const rows = await getDb().select().from(starrailAccounts);
    expect(rows.map((r) => r.uid).sort()).toEqual(["800000002", "900000001"]);
    expect(rows.every((r) => !r.cookieEncrypted.includes("v2_secret"))).toBe(true);
  });

  it("回傳剛連結的帳號 id（頁面導向它）：一定是自己那一列；好幾個時是第一個，重貼 cookie 時是原本那一列", async () => {
    const first = await linkAccount(COOKIE, ["800000002"]);
    const [row] = await getDb().select().from(starrailAccounts).where(eq(starrailAccounts.uid, "800000002"));
    expect(first).toMatchObject({ ok: true, accountId: row.id });
    expect(row.userId).toBe(me);

    const all = await linkAccount(COOKIE, "all");
    const [firstRole] = await getDb().select().from(starrailAccounts).where(eq(starrailAccounts.uid, "900000001"));
    expect(all).toMatchObject({ ok: true, accountId: firstRole.id });

    expect(await linkAccount(COOKIE, ["800000002"])).toMatchObject({ ok: true, accountId: row.id });
  });
});

describe("checkinAll（PGlite 整合）", () => {
  it("同一個 HoYoLAB 帳號的多個角色_只簽到一次_只寫一筆紀錄", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });

    await checkinAll();

    expect(hoyolab.signIn).toHaveBeenCalledOnce();
    const logs = await getDb().select().from(starrailCheckinLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ result: "success", totalSignDay: 4 });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("簽到結果寫進網站通知：模組 starrail、各角色的結果、連到 HoYoLAB 簽到頁", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });

    await checkinAll();

    expect(notify).toHaveBeenCalledWith({
      recipients: [me],
      module: "starrail",
      kind: "checkin",
      title: "星穹鐵道簽到完成",
      body: "A：簽到成功\nB：簽到成功",
      url: "https://act.hoyolab.com/bbs/event/signin/hkrpg/index.html?act_id=e202303301540311",
    });
  });
});

describe("checkStaminaAll（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]])));

  it("超過門檻只通知一次_降回門檻以下後再超過會再通知", async () => {
    await linkAccount(COOKIE);

    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(285)));
    await checkStaminaAll(NOON);
    await checkStaminaAll(NOON);
    expect(notify).toHaveBeenCalledOnce();

    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(100)));
    await checkStaminaAll(NOON);
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(290)));
    await checkStaminaAll(NOON);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("開拓力提醒寫進網站通知：模組 starrail、目前開拓力與回滿時間、連到星穹鐵道頁", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(285)));

    await checkStaminaAll(NOON);

    const [input] = notify.mock.calls[0];
    expect(input).toMatchObject({ recipients: [me], module: "starrail", kind: "stamina", title: "A 的開拓力快滿了", url: "/starrail" });
    expect(input.body).toContain("開拓力 285/300（門檻 280）");
    expect(input.body).toMatch(/預計 .+ 回滿/);
  });

  it("同一小時的排程送了兩次、前一次還在寫通知時後一次就開始了_開拓力只通知一次", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(285)));
    let release!: () => void;
    notify.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));

    const first = checkStaminaAll(NOON);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
    await checkStaminaAll(NOON);
    release();
    await first;

    expect(notify).toHaveBeenCalledOnce();
  });

  it("開拓力通知寫不進去_退回這一輪的認領，下一次排程再通知", async () => {
    captureErrorLog();
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(285)));
    notify.mockRejectedValueOnce(new Error("db down"));

    await checkStaminaAll(NOON);
    expect((await getDb().select().from(starrailAccounts))[0].lastStaminaAlertAt).toBeNull();

    await checkStaminaAll(NOON);
    expect(notify).toHaveBeenCalledTimes(2);
    expect((await getDb().select().from(starrailAccounts))[0].lastStaminaAlertAt).not.toBeNull();
  });

  it("cookie 失效時標記帳號_不丟例外", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true });

    const summary = await checkStaminaAll(NOON);

    expect(summary).toContain("查詢失敗");
    const [account] = await getDb().select().from(starrailAccounts);
    expect(account.cookieInvalid).toBe(true);
  });
});

describe("錯誤隔離（PGlite 整合）", () => {
  it("cookie 無法解密_getDailyNote 回提示並標記失效_不丟例外", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]]));
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieEncrypted: "bm90LWVuY3J5cHRlZA==" });
    const [account] = await getDb().select().from(starrailAccounts);

    const note = await getDailyNote(account);

    expect(note).toMatchObject({ ok: false, cookieInvalid: true });
    expect(!note.ok && note.message).toContain("cookie 無法解密，請重新連結");
    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(true);
  });

  it("cookie 無法解密_checkin 回失敗並寫紀錄_不丟例外", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]]));
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieEncrypted: "bm90LWVuY3J5cHRlZA==" });
    const [account] = await getDb().select().from(starrailAccounts);

    const result = await checkin(account);

    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("cookie 無法解密");
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(1);
  });

  it("checkinAll_某個帳號丟例外_其他帳號照樣簽到並通知", async () => {
    hoyolab.fetchGameRoles.mockResolvedValueOnce(ok([twoRoles[0]]));
    await linkAccount(COOKIE);
    hoyolab.fetchGameRoles.mockResolvedValueOnce(ok([twoRoles[1]]));
    await linkAccount("ltoken_v2=v2_other; ltuid_v2=43");
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 1 }));
    hoyolab.signIn
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });

    const summary = await checkinAll();

    expect(hoyolab.signIn).toHaveBeenCalledTimes(2);
    expect(summary).toContain("簽到成功");
    expect(summary).not.toContain("boom");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("checkStaminaAll_某個帳號丟例外_其他帳號照樣檢查", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok(note(100)));

    const summary = await checkStaminaAll(NOON);

    expect(hoyolab.fetchDailyNote).toHaveBeenCalledTimes(2);
    expect(summary).toContain("100/300");
    expect(summary).not.toContain("boom");
  });
});

describe("簽到通知與失效標記（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]])));

  it("全部都是今天已簽到_不發通知", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: true, totalSignDay: 5 }));

    await checkinAll();

    expect(notify).not.toHaveBeenCalled();
  });

  it("簽到 info 正常_清掉 cookie 失效標記", async () => {
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: true, totalSignDay: 5 }));

    await checkin(account);

    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(false);
  });

  it("同一次簽到先清掉失效標記、簽到時又發現 cookie 失效_最後標成失效（不能因為記憶體裡是舊值就跳過寫入）", async () => {
    captureErrorLog();
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 5 }));
    hoyolab.signIn.mockResolvedValue({ result: "failed", message: "HoYoLAB cookie 已失效", cookieInvalid: true, retcode: -100 });

    await checkin(account);

    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(true);
  });

  it("只有 ltoken_v2、ltuid_v2_可以連結；提醒列出少了的欄位與可能不能用的功能，另外放在 warning（畫面用警告樣式，不混在成功訊息裡）", async () => {
    const result = await linkAccount(COOKIE);

    expect(result).toMatchObject({ ok: true });
    const warning = result.ok ? result.warning : undefined;
    for (const text of ["ltmid_v2", "cookie_token_v2", "account_id_v2", "account_mid_v2", "即時便箋", "開拓月曆", "兌換碼"]) expect(warning).toContain(text);
    expect(result.ok && result.message).not.toContain("ltmid_v2");
  });

  it("有 ltmid_v2、少了 cookie_token_v2 與 account_ 開頭的兩個_提醒開拓月曆與兌換碼，不再提 ltmid_v2 與即時便箋", async () => {
    const result = await linkAccount(`${COOKIE}; ltmid_v2=mid_x`);

    const warning = result.ok ? result.warning : undefined;
    expect(warning).toContain("cookie_token_v2");
    expect(warning).toContain("開拓月曆");
    expect(warning).toContain("兌換碼");
    expect(warning).not.toContain("ltmid_v2");
    expect(warning).not.toContain("即時便箋");
  });

  it("六個都貼了_不提醒", async () => {
    const result = await linkAccount(`${COOKIE}; ltmid_v2=mid_x; cookie_token_v2=v2_ct; account_id_v2=42; account_mid_v2=mid_x`);

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.warning).toBeUndefined();
  });
});

describe("簽到失敗的 log（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]])));

  it("只記 retcode_不印 HoYoLAB 的訊息與 cookie", async () => {
    const log = captureErrorLog();
    await linkAccount(COOKIE);
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "failed", message: "HoYoLAB 回應錯誤（-10002：secret-detail）", cookieInvalid: false, retcode: -10002 });

    await checkin(account);

    expect(loggedText(log)).toContain("-10002");
    expect(loggedText(log)).not.toContain("secret-detail");
    expect(loggedText(log)).not.toContain("v2_secret");
  });
});

describe("checkinAccount（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]])));

  it("依 id 找到帳號_照常簽到", async () => {
    await linkAccount(COOKIE);
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: true, totalSignDay: 5 }));

    expect(await checkinAccount(account.id)).toMatchObject({ ok: true, already: true });
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(1);
  });

  it("找不到帳號_回錯誤_不呼叫 HoYoLAB", async () => {
    expect(await checkinAccount(999)).toEqual({ ok: false, error: "找不到這個帳號", accountChanged: false });
    expect(hoyolab.fetchCheckinInfo).not.toHaveBeenCalled();
  });
});

describe("cleanupCheckinLogs（PGlite 整合）", () => {
  const NOW = new Date("2026-10-21T12:00:00Z");
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000);

  it("只刪超過 14 天的簽到紀錄_帳號不動", async () => {
    const [account] = await getDb().insert(starrailAccounts).values({ userId: me, ltuid: "42", uid: "900000001", region: "prod_official_cht", cookieEncrypted: "x" }).returning();
    await getDb().insert(starrailCheckinLogs).values([
      { accountId: account.id, result: "success", message: "old", createdAt: daysAgo(15) },
      { accountId: account.id, result: "already", message: "edge", createdAt: daysAgo(14) },
      { accountId: account.id, result: "failed", message: "new", createdAt: daysAgo(1) },
    ]);

    expect(await cleanupCheckinLogs(NOW)).toBe("刪除 1 筆超過 14 天的簽到紀錄");

    const left = await getDb().select({ message: starrailCheckinLogs.message }).from(starrailCheckinLogs);
    expect(left.map((l) => l.message).sort()).toEqual(["edge", "new"]);
    expect(await getDb().select().from(starrailAccounts)).toHaveLength(1);
  });
});

describe("每個人的帳號各自一份", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]])));

  it("連結的帳號記在連結的人名下", async () => {
    await linkAccount(COOKIE);

    expect((await getDb().select().from(starrailAccounts)).map((a) => a.userId)).toEqual([me]);
  });

  it("同一個 UID 已經被別人連結_拒絕並說明，不改對方的 cookie 與擁有者", async () => {
    await linkAccount(COOKIE);
    const [before] = await getDb().select().from(starrailAccounts);

    const result = await link.linkAccount(other, "ltoken_v2=v2_bob; ltuid_v2=42", "all");

    expect(result).toEqual({ ok: false, error: "UID 900000001 已經被其他使用者連結了，同一個遊戲帳號只能連結在一個帳號底下" });
    const [after] = await getDb().select().from(starrailAccounts);
    expect(after).toMatchObject({ userId: me, cookieEncrypted: before.cookieEncrypted });
  });

  it("選了好幾個角色、其中一個被別人連結_整批都不寫入", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[1]]));
    await link.linkAccount(other, COOKIE, "all");
    hoyolab.fetchGameRoles.mockResolvedValue(ok(twoRoles));

    expect(await linkAccount(COOKIE, "all")).toMatchObject({ ok: false, error: expect.stringContaining("800000002") });
    expect((await getDb().select().from(starrailAccounts)).map((a) => [a.uid, a.userId])).toEqual([["800000002", other]]);
  });

  it("自己重新連結同一個 UID_照常更新 cookie", async () => {
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });

    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });
    expect((await getDb().select().from(starrailAccounts))[0]).toMatchObject({ userId: me, cookieInvalid: false });
  });

  it("帳號清單與簽到紀錄只有自己的", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);
    await getDb().insert(starrailCheckinLogs).values({ accountId: mine.id, result: "success" });

    expect(await accounts.listAccountViews(other)).toEqual([]);
    expect(await checkins.recentCheckins(other, 20)).toEqual([]);
    expect(await checkins.recentCheckins(other, 20, mine.id)).toEqual([]);
    expect((await accounts.listAccountViews(me)).map((a) => a.uid)).toEqual(["900000001"]);
    expect(await checkins.recentCheckins(me, 20, mine.id)).toHaveLength(1);
  });

  it("用別人的帳號 id 簽到、設門檻、關提醒、移除、同步 cookie 狀態_都當作不存在，不呼叫 HoYoLAB、不改資料", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);

    expect(await checkins.checkinAccount(other, mine.id)).toEqual({ ok: false, error: "找不到這個帳號", accountChanged: false });
    expect(await accounts.setStaminaThreshold(other, mine.id, 100)).toBe(false);
    expect(await accounts.setGameReminders(other, mine.id, false)).toBe(false);
    expect(await accounts.syncCookieInvalid(other, mine.id, true)).toBe(false);
    await accounts.removeAccount(other, mine.id);

    expect(hoyolab.fetchCheckinInfo).not.toHaveBeenCalled();
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(0);
    expect((await getDb().select().from(starrailAccounts))[0]).toMatchObject({ id: mine.id, staminaAlertThreshold: null, cookieInvalid: false, gameReminders: true });
  });

  it("自己的帳號_設門檻、關掉與打開提醒都回 true、移除後就沒了", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);

    expect(await accounts.setStaminaThreshold(me, mine.id, 100)).toBe(true);
    expect(await accounts.setGameReminders(me, mine.id, false)).toBe(true);
    expect((await accounts.listAccountViews(me))[0]).toMatchObject({ id: mine.id, gameReminders: false });
    expect(await accounts.setGameReminders(me, mine.id, true)).toBe(true);
    expect((await accounts.listAccountViews(me))[0]).toMatchObject({ id: mine.id, gameReminders: true });
    await accounts.removeAccount(me, mine.id);

    expect(await getDb().select().from(starrailAccounts)).toHaveLength(0);
  });

  it("刪除帳號時，連結的遊戲帳號與簽到紀錄一起刪除", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);
    await getDb().insert(starrailCheckinLogs).values({ accountId: mine.id, result: "success" });

    await getDb().delete(coreUsers).where(eq(coreUsers.id, me));

    expect(await getDb().select().from(starrailAccounts)).toHaveLength(0);
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(0);
  });
});

describe("排程照常處理所有人的帳號，通知送給帳號的擁有者", () => {
  async function linkFor(userId: string, gameRole: (typeof twoRoles)[number], ltuid: string) {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([gameRole]));
    await link.linkAccount(userId, `ltoken_v2=v2_${ltuid}; ltuid_v2=${ltuid}`, "all");
  }

  it("checkinAll_每個擁有者各收到一則，只列他自己的角色", async () => {
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });

    await checkinAll();

    expect(hoyolab.signIn).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls.map(([input]) => [input.recipients, input.body]).sort()).toEqual(
      [
        [[me], "A：簽到成功"],
        [[other], "B：簽到成功"],
      ].sort(),
    );
  });

  it("checkinAll_某個人的帳號都已簽到過_只有他不收通知", async () => {
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    hoyolab.fetchCheckinInfo.mockImplementation(async (cookie: string) => ok({ isSigned: cookie.includes("v2_41"), totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });

    await checkinAll();

    expect(notify.mock.calls.map(([input]) => input.recipients)).toEqual([[other]]);
  });

  it("停用的帳號（凍結）_排程不用他的 cookie 簽到、查便箋或發開拓力提醒；帳號資料保留，恢復後照常", async () => {
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(290)));
    const cookiesUsed = () => [hoyolab.fetchCheckinInfo, hoyolab.signIn, hoyolab.fetchDailyNote].flatMap((fn) => fn.mock.calls.map(([cookie]) => String(cookie)));

    await checkinAll();
    await checkStaminaAll(NOON);

    expect(cookiesUsed().some((cookie) => cookie.includes("v2_42"))).toBe(false);
    expect(cookiesUsed().some((cookie) => cookie.includes("v2_41"))).toBe(true);
    expect(notify.mock.calls.flatMap(([input]) => input.recipients)).not.toContain(other);
    expect(await getDb().select().from(starrailAccounts)).toHaveLength(2);

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    await checkStaminaAll(NOON);
    expect(cookiesUsed().some((cookie) => cookie.includes("v2_42"))).toBe(true);
  });

  it("checkStaminaAll_開拓力提醒只送給那個帳號的擁有者", async () => {
    await linkFor(other, twoRoles[0], "42");
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(290)));

    await checkStaminaAll(NOON);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0].recipients).toEqual([other]);
  });

  it("寄給某個人失敗_不影響其他人的通知", async () => {
    captureErrorLog();
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 });
    notify.mockRejectedValueOnce(new Error("boom"));

    await checkinAll();

    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("帳號的快取（starrail:accounts）只在帳號那一列真的改了才失效：HoYoLAB 的快取都標著它", () => {
  beforeEach(async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([twoRoles[0]]));
    await linkAccount(COOKIE);
    resetNextCache();
  });

  it("開拓力排程什麼都沒改（沒到門檻、cookie 正常）_不失效，頁面不用重查", async () => {
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(100)));

    await checkStaminaAll(NOON);

    expect(expiredTags()).toEqual([]);
  });

  it("開拓力排程寫了提醒狀態（通知或重設）_失效", async () => {
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(285)));
    await checkStaminaAll(NOON);
    expect(expiredTags()).toEqual(["starrail:accounts"]);

    resetNextCache();
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note(100)));
    await checkStaminaAll(NOON);
    expect(expiredTags()).toEqual(["starrail:accounts"]);
  });

  it("開拓力排程發現 cookie 失效（標記從沒有變成有）_失效；下一小時還是失效、標記沒變_不再失效", async () => {
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true });

    await checkStaminaAll(NOON);
    expect(expiredTags()).toEqual(["starrail:accounts"]);

    resetNextCache();
    await checkStaminaAll(NOON);
    expect(expiredTags()).toEqual([]);
  });

  it("簽到排程：標記沒變_不失效；簽到時發現 cookie 失效_失效", async () => {
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: true, totalSignDay: 5 }));
    await checkinAll();
    expect(expiredTags()).toEqual([]);

    resetNextCache();
    captureErrorLog();
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true });
    hoyolab.signIn.mockResolvedValue({ result: "failed", message: "HoYoLAB cookie 已失效", cookieInvalid: true, retcode: -100 });
    await checkinAll();
    expect(expiredTags()).toEqual(["starrail:accounts"]);
  });

  it("立即簽到回報帳號有沒有改（Server Action 依它決定要不要讓帳號的快取失效）", async () => {
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue(ok({ isSigned: true, totalSignDay: 5 }));
    expect(await checkinAccount(account.id)).toMatchObject({ ok: true, accountChanged: false });

    await getDb().update(starrailAccounts).set({ cookieInvalid: true });
    expect(await checkinAccount(account.id)).toMatchObject({ ok: true, accountChanged: true });
  });
});
