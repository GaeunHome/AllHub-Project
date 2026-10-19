import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { starrailAccounts } from "../data/schema";
import { COOKIE, hoyolab, ok, role } from "../dev/fixtures";

vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab);

stubCoreEnv();

const accounts = await import("./accounts");
const link = await import("./link");
const redeem = await import("./redeem");

const REDEEM_COOKIE = `${COOKIE}; cookie_token_v2=ct_secret; account_id_v2=42`;
const CHT = role({ regionName: "TW, HK, MO" });
const ASIA = role({ uid: "800000002", nickname: "小號", region: "prod_official_asia", regionName: "Asia", level: 4 });

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

/** 沒特別說的都是 me 在操作 */
const linkAccount = (cookie: string, selection?: Parameters<typeof link.linkAccount>[2]) => link.linkAccount(me, cookie, selection);
const listAccountViews = () => accounts.listAccountViews(me);
const redeemCodeFor = (accountId: number, code: string) => redeem.redeemCodeFor(me, accountId, code);

const uids = async () => (await testDb.select().from(starrailAccounts)).map((r) => r.uid).sort();

beforeEach(async () => {
  [me, other] = await insertTestUsers(testDb);
  for (const fn of Object.values(hoyolab)) fn.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT, ASIA]));
  hoyolab.redeemCode.mockResolvedValue({ ok: true, message: "獎勵會寄到遊戲內信箱", retcode: 0, cookieInvalid: false });
});

describe("linkAccount：連結時先選伺服器", () => {
  it("ask_有好幾個角色_回傳可以選的清單（伺服器中文名稱、預設勾最高等級），還沒寫入", async () => {
    const result = await linkAccount(COOKIE, "ask");

    expect(result).toEqual({
      ok: false,
      roles: [
        { uid: "900000001", nickname: "開拓者", server: "台港澳服", level: 70, selected: true },
        { uid: "800000002", nickname: "小號", server: "亞服", level: 4, selected: false },
      ],
    });
    expect(await uids()).toEqual([]);
  });

  it("ask_只有一個角色_直接連結", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT]));

    expect(await linkAccount(COOKIE, "ask")).toMatchObject({ ok: true });
    expect(await uids()).toEqual(["900000001"]);
  });

  it("只連結選到的 UID", async () => {
    expect(await linkAccount(COOKIE, ["900000001"])).toMatchObject({ ok: true, message: expect.stringContaining("900000001") });
    expect(await uids()).toEqual(["900000001"]);
  });

  it("沒選任何一個_回錯誤、不寫入", async () => {
    expect(await linkAccount(COOKIE, [])).toEqual({ ok: false, error: "請至少選一個要連結的帳號" });
    expect(await uids()).toEqual([]);
  });

  it("選到的 UID 不在這個 HoYoLAB 帳號底下（表單被改過）_不寫入", async () => {
    expect(await linkAccount(COOKIE, ["123456789"])).toEqual({ ok: false, error: "請至少選一個要連結的帳號" });
    expect(await uids()).toEqual([]);
  });

  it("帳號清單帶伺服器（頁面用中文名稱切換）", async () => {
    await linkAccount(COOKIE, ["900000001", "800000002"]);

    expect((await listAccountViews()).map((a) => a.region).sort()).toEqual(["prod_official_asia", "prod_official_cht"]);
  });
});

describe("redeemCodeFor：兌換碼，參數是帳號 id", () => {
  const linkWith = async (cookie: string) => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT]));
    await linkAccount(cookie, "all");
    return (await testDb.select().from(starrailAccounts))[0];
  };

  it("整理兌換碼後送出_用這個帳號的 UID 與伺服器_成功訊息", async () => {
    const account = await linkWith(REDEEM_COOKIE);

    expect(await redeemCodeFor(account.id, " starrail gift ")).toEqual({ ok: true, message: "獎勵會寄到遊戲內信箱" });
    // 連結時只留需要的鍵 照固定順序存
    expect(hoyolab.redeemCode).toHaveBeenCalledWith(`${COOKIE}; account_id_v2=42; cookie_token_v2=ct_secret`, "900000001", "prod_official_cht", "STARRAILGIFT");
  });

  it("兌換碼格式不對_不送出", async () => {
    const account = await linkWith(REDEEM_COOKIE);

    expect(await redeemCodeFor(account.id, "星穹")).toMatchObject({ ok: false, error: expect.stringContaining("4–20") });
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("cookie 缺兌換用的欄位_提示重新連結並一起貼上，不送出", async () => {
    const account = await linkWith(COOKIE);

    const result = await redeemCodeFor(account.id, "STARRAILGIFT");

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("cookie_token_v2") });
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("有 cookie_token_v2、沒貼 account_id_v2_用 ltuid_v2 補上，照樣送出（不要求重新連結）", async () => {
    const account = await linkWith(`${COOKIE}; cookie_token_v2=ct_secret`);

    expect(await redeemCodeFor(account.id, "STARRAILGIFT")).toEqual({ ok: true, message: "獎勵會寄到遊戲內信箱" });
    expect(hoyolab.redeemCode).toHaveBeenCalledTimes(1);
  });

  it("兌換回報 cookie 失效_只回兌換的錯誤，不寫帳號的失效標記（只由即時便箋與簽到決定）", async () => {
    const account = await linkWith(REDEEM_COOKIE);
    hoyolab.redeemCode.mockResolvedValue({ ok: false, message: "HoYoLAB cookie 已失效", retcode: -1071, cookieInvalid: true });

    expect(await redeemCodeFor(account.id, "STARRAILGIFT")).toEqual({ ok: false, error: "HoYoLAB cookie 已失效" });
    expect((await testDb.select().from(starrailAccounts).where(eq(starrailAccounts.id, account.id)))[0].cookieInvalid).toBe(false);
  });

  it("兌換失敗_log 只記 retcode，不記兌換碼與 cookie", async () => {
    const log = captureErrorLog();
    const account = await linkWith(REDEEM_COOKIE);
    hoyolab.redeemCode.mockResolvedValue({ ok: false, message: "兌換碼無效", retcode: -2004, cookieInvalid: false });

    expect(await redeemCodeFor(account.id, "SECRETCODE99")).toEqual({ ok: false, error: "兌換碼無效" });
    expect(loggedText(log)).toContain("-2004");
    expect(loggedText(log)).not.toContain("SECRETCODE99");
    expect(loggedText(log)).not.toContain("ct_secret");
  });

  it("帳號不存在_回錯誤", async () => {
    expect(await redeemCodeFor(999_999, "STARRAILGIFT")).toMatchObject({ ok: false });
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });
});

describe("擁有權：別人的帳號 id 當作不存在", () => {
  it("用別人的帳號 id 兌換_回找不到，不呼叫 HoYoLAB", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT]));
    await linkAccount(REDEEM_COOKIE, "all");
    const [mine] = await testDb.select().from(starrailAccounts);

    expect(await redeem.redeemCodeFor(other, mine.id, "STARRAILGIFT")).toEqual({ ok: false, error: "找不到這個帳號，請重新整理頁面" });
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("選伺服器的第二步送來別人已經連結的 UID_拒絕，不寫入", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT]));
    await link.linkAccount(other, COOKIE, "all");
    hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT, ASIA]));

    expect(await linkAccount(COOKIE, ["900000001", "800000002"])).toMatchObject({ ok: false, error: expect.stringContaining("900000001") });
    expect((await testDb.select().from(starrailAccounts)).map((a) => a.userId)).toEqual([other]);
  });
});

describe("setAutoRedeem：自動兌換的開關，參數是帳號 id", () => {
  beforeEach(() => hoyolab.fetchGameRoles.mockResolvedValue(ok([CHT])));
  const autoRedeemOf = async () => (await testDb.select().from(starrailAccounts))[0].autoRedeem;

  it("cookie 有 cookie_token_v2（帳號 id 用 ltuid_v2 補上）_可以打開，畫面讀到的也是打開；關掉也可以", async () => {
    await linkAccount(`${COOKIE}; cookie_token_v2=ct_secret`, "all");
    const [mine] = await testDb.select().from(starrailAccounts);

    expect(await listAccountViews()).toMatchObject([{ id: mine.id, autoRedeem: false, canAutoRedeem: true }]);
    expect(await accounts.setAutoRedeem(me, mine.id, true)).toEqual({ ok: true });
    expect(await listAccountViews()).toMatchObject([{ autoRedeem: true }]);
    expect(await accounts.setAutoRedeem(me, mine.id, false)).toEqual({ ok: true });
    expect(await autoRedeemOf()).toBe(false);
  });

  it("cookie 沒有 cookie_token_v2_不能打開，說明要補哪個欄位；畫面上的開關也標成不能用；關掉照樣可以", async () => {
    await linkAccount(COOKIE, "all");
    const [mine] = await testDb.select().from(starrailAccounts);

    expect(await listAccountViews()).toMatchObject([{ canAutoRedeem: false }]);
    expect(await accounts.setAutoRedeem(me, mine.id, true)).toEqual({ ok: false, error: expect.stringContaining("cookie_token_v2") });
    expect(await autoRedeemOf()).toBe(false);
    expect(await accounts.setAutoRedeem(me, mine.id, false)).toEqual({ ok: true });
  });

  it("畫面讀到的帳號資料只有能不能打開，沒有 cookie 原文也沒有密文", async () => {
    await linkAccount(REDEEM_COOKIE, "all");
    const [mine] = await testDb.select().from(starrailAccounts);

    const views = await listAccountViews();

    expect(JSON.stringify(views)).not.toContain("ct_secret");
    expect(JSON.stringify(views)).not.toContain(mine.cookieEncrypted);
    expect(views[0]).not.toHaveProperty("cookieEncrypted");
  });

  it("用別人的帳號 id 打開或關掉_當作不存在，不改資料", async () => {
    await linkAccount(REDEEM_COOKIE, "all");
    const [mine] = await testDb.select().from(starrailAccounts);

    expect(await accounts.setAutoRedeem(other, mine.id, true)).toEqual({ ok: false, error: "找不到這個帳號，請重新整理頁面" });
    expect(await autoRedeemOf()).toBe(false);

    await accounts.setAutoRedeem(me, mine.id, true);
    expect(await accounts.setAutoRedeem(other, mine.id, false)).toMatchObject({ ok: false });
    expect(await autoRedeemOf()).toBe(true);
  });
});
