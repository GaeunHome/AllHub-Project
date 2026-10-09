import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import type { DailyNote } from "../lib/responses";
import { starrailAccounts, starrailCheckinLogs } from "../data/schema";

// HoYoLAB 的 client 整個換掉：沒設定回應的呼叫只會拿到 undefined，不會連到真的 HoYoLAB
const hoyolab = vi.hoisted(() => ({ fetchGameRoles: vi.fn(), fetchDailyNote: vi.fn(), fetchCheckinInfo: vi.fn(), signIn: vi.fn() }));
vi.mock("../lib/hoyolab", () => hoyolab);
vi.mock("@/core/notify", { spy: true });

stubCoreEnv();

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const service = await import("./accounts");
const { checkin, checkinAll, checkStaminaAll, cleanupCheckinLogs, getDailyNote } = service;

const COOKIE = "ltoken_v2=v2_secret; ltuid_v2=42";
const twoRoles = [
  { uid: "900000001", nickname: "A", region: "prod_official_cht", regionName: null, level: 70 },
  { uid: "800000002", nickname: "B", region: "prod_official_asia", regionName: null, level: 40 },
];

function note(stamina: number): DailyNote {
  return {
    stamina, maxStamina: 300, staminaRecoverSeconds: (300 - stamina) * 360, reserveStamina: 0,
    expeditionsAccepted: 0, expeditionsTotal: 4, trainScore: 0, maxTrainScore: 500,
    rogueScore: 0, maxRogueScore: 14000, cocoonRemaining: 3, cocoonLimit: 3,
  };
}

const getDb = setupTestDb();
let me: string;
let other: string;

/** 沒特別說的都是 me 在操作 */
const linkAccount = (cookie: string, selection?: Parameters<typeof service.linkAccount>[2]) => service.linkAccount(me, cookie, selection);
const checkinAccount = (id: number) => service.checkinAccount(me, id);

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  notify.mockReset().mockResolvedValue(undefined);
  hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: twoRoles, raw: {} });
});

describe("linkAccount（PGlite 整合）", () => {
  it("一個 cookie 兩個角色_各存一列_cookie 只存密文_重貼不重複", async () => {
    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });
    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });

    const rows = await getDb().select().from(starrailAccounts);
    expect(rows.map((r) => r.uid).sort()).toEqual(["800000002", "900000001"]);
    expect(rows.every((r) => !r.cookieEncrypted.includes("v2_secret"))).toBe(true);
  });
});

describe("checkinAll（PGlite 整合）", () => {
  it("同一個 HoYoLAB 帳號的多個角色_只簽到一次_只寫一筆紀錄", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });

    await checkinAll();

    expect(hoyolab.signIn).toHaveBeenCalledOnce();
    const logs = await getDb().select().from(starrailCheckinLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ result: "success", totalSignDay: 4 });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("簽到結果寫進網站通知：模組 starrail、各角色的結果、連到 HoYoLAB 簽到頁", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });

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
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} }));

  it("超過門檻只通知一次_降回門檻以下後再超過會再通知", async () => {
    await linkAccount(COOKIE);

    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(285), raw: {} });
    await checkStaminaAll();
    await checkStaminaAll();
    expect(notify).toHaveBeenCalledOnce();

    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(100), raw: {} });
    await checkStaminaAll();
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(290), raw: {} });
    await checkStaminaAll();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("開拓力提醒寫進網站通知：模組 starrail、目前開拓力與回滿時間、連到星穹鐵道頁", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(285), raw: {} });

    await checkStaminaAll();

    const [input] = notify.mock.calls[0];
    expect(input).toMatchObject({ recipients: [me], module: "starrail", kind: "stamina", title: "A 的開拓力快滿了", url: "/starrail" });
    expect(input.body).toContain("開拓力 285/300（門檻 280）");
    expect(input.body).toMatch(/預計 .+ 回滿/);
  });

  it("cookie 失效時標記帳號_不丟例外", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });

    const summary = await checkStaminaAll();

    expect(summary).toContain("查詢失敗");
    const [account] = await getDb().select().from(starrailAccounts);
    expect(account.cookieInvalid).toBe(true);
  });
});

describe("錯誤隔離（PGlite 整合）", () => {
  it("cookie 無法解密_getDailyNote 回提示並標記失效_不丟例外", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} });
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
    hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} });
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieEncrypted: "bm90LWVuY3J5cHRlZA==" });
    const [account] = await getDb().select().from(starrailAccounts);

    const result = await checkin(account);

    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("cookie 無法解密");
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(1);
  });

  it("checkinAll_某個帳號丟例外_其他帳號照樣簽到並通知", async () => {
    hoyolab.fetchGameRoles.mockResolvedValueOnce({ ok: true, data: [twoRoles[0]], raw: {} });
    await linkAccount(COOKIE);
    hoyolab.fetchGameRoles.mockResolvedValueOnce({ ok: true, data: [twoRoles[1]], raw: {} });
    await linkAccount("ltoken_v2=v2_other; ltuid_v2=43");
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 1 }, raw: {} });
    hoyolab.signIn
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });

    const summary = await checkinAll();

    expect(hoyolab.signIn).toHaveBeenCalledTimes(2);
    expect(summary).toContain("簽到成功");
    expect(summary).not.toContain("boom");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("checkStaminaAll_某個帳號丟例外_其他帳號照樣檢查", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchDailyNote.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true, data: note(100), raw: {} });

    const summary = await checkStaminaAll();

    expect(hoyolab.fetchDailyNote).toHaveBeenCalledTimes(2);
    expect(summary).toContain("100/300");
    expect(summary).not.toContain("boom");
  });
});

describe("簽到通知與失效標記（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} }));

  it("全部都是今天已簽到_不發通知", async () => {
    await linkAccount(COOKIE);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: true, totalSignDay: 5 }, raw: {} });

    await checkinAll();

    expect(notify).not.toHaveBeenCalled();
  });

  it("簽到 info 正常_清掉 cookie 失效標記", async () => {
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: true, totalSignDay: 5 }, raw: {} });

    await checkin(account);

    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(false);
  });

  it("同一次簽到先清掉失效標記、簽到時又發現 cookie 失效_最後標成失效（不能因為記憶體裡是舊值就跳過寫入）", async () => {
    captureErrorLog();
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 5 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "failed", message: "HoYoLAB cookie 已失效", cookieInvalid: true, raw: { retcode: -100 } });

    await checkin(account);

    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(true);
  });

  it("沒有 ltmid_v2_可以連結_訊息提示一併貼上", async () => {
    const result = await linkAccount(COOKIE);

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.message).toContain("建議一併貼上 ltmid_v2");
  });

  it("有 ltmid_v2_不提示", async () => {
    const result = await linkAccount(`${COOKIE}; ltmid_v2=mid_x`);

    expect(result.ok && result.message).not.toContain("ltmid_v2");
  });
});

describe("簽到失敗的 log（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} }));

  it("只記 retcode_不印 HoYoLAB 的原始回應", async () => {
    const log = captureErrorLog();
    await linkAccount(COOKIE);
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({
      result: "failed",
      message: "HoYoLAB 回應錯誤（-10002：secret-detail）",
      cookieInvalid: false,
      raw: { retcode: -10002, message: "secret-detail", data: { echo: "ltoken_v2=v2_secret" } },
    });

    await checkin(account);

    expect(loggedText(log)).toContain("-10002");
    expect(loggedText(log)).not.toContain("secret-detail");
    expect(loggedText(log)).not.toContain("v2_secret");
  });
});

describe("checkinAccount（PGlite 整合）", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} }));

  it("依 id 找到帳號_照常簽到", async () => {
    await linkAccount(COOKIE);
    const [account] = await getDb().select().from(starrailAccounts);
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: true, totalSignDay: 5 }, raw: {} });

    expect(await checkinAccount(account.id)).toMatchObject({ ok: true, already: true });
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(1);
  });

  it("找不到帳號_回錯誤_不呼叫 HoYoLAB", async () => {
    expect(await checkinAccount(999)).toEqual({ ok: false, error: "找不到這個帳號" });
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
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[0]], raw: {} }));

  it("連結的帳號記在連結的人名下", async () => {
    await linkAccount(COOKIE);

    expect((await getDb().select().from(starrailAccounts)).map((a) => a.userId)).toEqual([me]);
  });

  it("同一個 UID 已經被別人連結_拒絕並說明，不改對方的 cookie 與擁有者", async () => {
    await linkAccount(COOKIE);
    const [before] = await getDb().select().from(starrailAccounts);

    const result = await service.linkAccount(other, "ltoken_v2=v2_bob; ltuid_v2=42", "all");

    expect(result).toEqual({ ok: false, error: "UID 900000001 已經被其他使用者連結了，同一個遊戲帳號只能連結在一個帳號底下" });
    const [after] = await getDb().select().from(starrailAccounts);
    expect(after).toMatchObject({ userId: me, cookieEncrypted: before.cookieEncrypted });
  });

  it("選了好幾個角色、其中一個被別人連結_整批都不寫入", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [twoRoles[1]], raw: {} });
    await service.linkAccount(other, COOKIE, "all");
    hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: twoRoles, raw: {} });

    expect(await linkAccount(COOKIE, "all")).toMatchObject({ ok: false, error: expect.stringContaining("800000002") });
    expect((await getDb().select().from(starrailAccounts)).map((a) => [a.uid, a.userId])).toEqual([["800000002", other]]);
  });

  it("自己重新連結同一個 UID_照常更新 cookie", async () => {
    await linkAccount(COOKIE);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });

    expect(await linkAccount(COOKIE)).toMatchObject({ ok: true });
    expect((await getDb().select().from(starrailAccounts))[0]).toMatchObject({ userId: me, cookieInvalid: false });
  });

  it("沒有擁有者的列（部署空窗期舊程式連結的）_重新連結就歸給連結的人", async () => {
    await getDb().insert(starrailAccounts).values({ ltuid: "42", uid: "900000001", region: "prod_official_cht", cookieEncrypted: "v1:old" });

    expect(await service.linkAccount(other, COOKIE, "all")).toMatchObject({ ok: true });
    expect((await getDb().select().from(starrailAccounts))[0].userId).toBe(other);
  });

  it("帳號清單與簽到紀錄只有自己的", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);
    await getDb().insert(starrailCheckinLogs).values({ accountId: mine.id, result: "success" });

    expect(await service.listAccountViews(other)).toEqual([]);
    expect(await service.recentCheckins(other, 20)).toEqual([]);
    expect(await service.recentCheckins(other, 20, mine.id)).toEqual([]);
    expect((await service.listAccountViews(me)).map((a) => a.uid)).toEqual(["900000001"]);
    expect(await service.recentCheckins(me, 20, mine.id)).toHaveLength(1);
  });

  it("用別人的帳號 id 簽到、設門檻、移除、同步 cookie 狀態_都當作不存在，不呼叫 HoYoLAB、不改資料", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);

    expect(await service.checkinAccount(other, mine.id)).toEqual({ ok: false, error: "找不到這個帳號" });
    expect(await service.setStaminaThreshold(other, mine.id, 100)).toBe(false);
    expect(await service.syncCookieInvalid(other, mine.id, true)).toBe(false);
    await service.removeAccount(other, mine.id);

    expect(hoyolab.fetchCheckinInfo).not.toHaveBeenCalled();
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(0);
    expect((await getDb().select().from(starrailAccounts))[0]).toMatchObject({ id: mine.id, staminaAlertThreshold: null, cookieInvalid: false });
  });

  it("自己的帳號_設門檻回 true、移除後就沒了", async () => {
    await linkAccount(COOKIE);
    const [mine] = await getDb().select().from(starrailAccounts);

    expect(await service.setStaminaThreshold(me, mine.id, 100)).toBe(true);
    await service.removeAccount(me, mine.id);

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
  async function linkFor(userId: string, role: (typeof twoRoles)[number], ltuid: string) {
    hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [role], raw: {} });
    await service.linkAccount(userId, `ltoken_v2=v2_${ltuid}; ltuid_v2=${ltuid}`, "all");
  }

  it("checkinAll_每個擁有者各收到一則，只列他自己的角色", async () => {
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });

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
    hoyolab.fetchCheckinInfo.mockImplementation(async (cookie: string) => ({ ok: true, data: { isSigned: cookie.includes("v2_41"), totalSignDay: 3 }, raw: {} }));
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });

    await checkinAll();

    expect(notify.mock.calls.map(([input]) => input.recipients)).toEqual([[other]]);
  });

  it("沒有擁有者的帳號（部署空窗期舊程式連結的）_排程略過：不簽到也不通知", async () => {
    await getDb().insert(starrailAccounts).values({ ltuid: "42", uid: "900000001", region: "prod_official_cht", cookieEncrypted: "v1:old" });

    expect(await checkinAll()).toBe("沒有連結的帳號");
    expect(await checkStaminaAll()).toBe("沒有連結的帳號");
    expect(hoyolab.fetchCheckinInfo).not.toHaveBeenCalled();
    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
  });

  it("停用的帳號（凍結）_排程不用他的 cookie 簽到、查便箋或發開拓力提醒；帳號資料保留，恢復後照常", async () => {
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(290), raw: {} });
    const cookiesUsed = () => [hoyolab.fetchCheckinInfo, hoyolab.signIn, hoyolab.fetchDailyNote].flatMap((fn) => fn.mock.calls.map(([cookie]) => String(cookie)));

    await checkinAll();
    await checkStaminaAll();

    expect(cookiesUsed().some((cookie) => cookie.includes("v2_42"))).toBe(false);
    expect(cookiesUsed().some((cookie) => cookie.includes("v2_41"))).toBe(true);
    expect(notify.mock.calls.flatMap(([input]) => input.recipients)).not.toContain(other);
    expect(await getDb().select().from(starrailAccounts)).toHaveLength(2);

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    await checkStaminaAll();
    expect(cookiesUsed().some((cookie) => cookie.includes("v2_42"))).toBe(true);
  });

  it("checkStaminaAll_開拓力提醒只送給那個帳號的擁有者", async () => {
    await linkFor(other, twoRoles[0], "42");
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: note(290), raw: {} });

    await checkStaminaAll();

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0].recipients).toEqual([other]);
  });

  it("寄給某個人失敗_不影響其他人的通知", async () => {
    captureErrorLog();
    await linkFor(me, twoRoles[0], "41");
    await linkFor(other, twoRoles[1], "42");
    hoyolab.fetchCheckinInfo.mockResolvedValue({ ok: true, data: { isSigned: false, totalSignDay: 3 }, raw: {} });
    hoyolab.signIn.mockResolvedValue({ result: "success", message: "簽到成功", cookieInvalid: false, raw: {} });
    notify.mockRejectedValueOnce(new Error("boom"));

    await checkinAll();

    expect(notify).toHaveBeenCalledTimes(2);
  });
});
