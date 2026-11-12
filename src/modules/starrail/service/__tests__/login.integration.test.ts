import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/core/crypto";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, expiredTags, loggedText, mocksOf } from "@/dev/test-helpers";
import { loginCookie } from "../../lib/cookie";
import { aigisHeader } from "../../lib/passport";
import { starrailAccounts } from "../../data/schema";
import { COOKIE, dailyNote, hoyolab, ok, role } from "../../dev/fixtures";
import { starrailTags } from "../cache-tags";

vi.mock("../../lib/hoyolab", async () => (await import("../../dev/fixtures")).hoyolab);
vi.mock("@/core/notify", { spy: true });

stubCoreEnv();

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { linkAccount } = await import("../link");
const { loginAccount } = await import("../login");
const { refreshOwnCookie } = await import("../refresh");
const { checkin } = await import("../checkin");
const { getDailyNote } = await import("../stamina");
const { charactersFor, dailyNoteFor } = await import("../page-reads");

const getDb = setupTestDb();
let me: string;
let other: string;

const PASSWORD = "Sup3r-secret-pw";
const FIELDS = { account: "me@example.com", password: PASSWORD, deviceId: "abcdefghij123456" };
const VERIFY = JSON.stringify({ risk_ticket: "rt-1", verify_str: JSON.stringify({ ticket: "ticket-1", verify_type: "email" }) });
const LOGGED_IN = loginCookie({ aid: "42", mid: "mid_x", stoken: "v2_stoken", ltoken: "v2_old_lt", cookieToken: "v2_old_ct" });
const EXPIRED = { ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true };
const storedCookies = async () => (await getDb().select().from(starrailAccounts)).map((row) => decryptSecret(row.cookieEncrypted));
const accountRow = async (uid = "900000001") => (await getDb().select().from(starrailAccounts).where(eq(starrailAccounts.uid, uid)))[0];

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  notify.mockReset().mockResolvedValue(undefined);
  hoyolab.fetchGameRoles.mockResolvedValue(ok([role()]));
  hoyolab.tokensFromStoken.mockResolvedValue({ ok: true, ltoken: "v2_new_lt", cookieToken: "v2_new_ct" });
});

// 使用者要的 盡可能保存 cookie 用帳號密碼登入拿到 stoken 之後自動換新
describe("loginAccount：用 HoYoverse 帳號密碼連結", () => {
  it("要 email 驗證：先回 email 這一步；帶驗證碼再送一次，驗證後帶著 x-rpc-verify 登入、換出 cookie、連結帳號，存的 cookie 有 stoken", async () => {
    hoyolab.appLogin.mockResolvedValueOnce({ kind: "email", verify: VERIFY }).mockResolvedValueOnce({ kind: "ok", stoken: "v2_stoken", mid: "mid_x", aid: "42" });
    hoyolab.verifyEmailCode.mockResolvedValue({ ok: true });

    expect(await loginAccount(me, FIELDS)).toEqual({ step: "email", verify: VERIFY });
    const linked = await loginAccount(me, { ...FIELDS, verify: VERIFY, code: "123456" });

    expect(hoyolab.verifyEmailCode).toHaveBeenCalledExactlyOnceWith("ticket-1", "123456");
    expect(hoyolab.appLogin).toHaveBeenLastCalledWith({ ...FIELDS, verify: VERIFY });
    expect(hoyolab.tokensFromStoken).toHaveBeenCalledExactlyOnceWith("v2_stoken", "mid_x");
    expect(linked).toMatchObject({ ok: true, accountId: (await accountRow()).id });
    expect(await storedCookies()).toEqual([loginCookie({ aid: "42", mid: "mid_x", stoken: "v2_stoken", ltoken: "v2_new_lt", cookieToken: "v2_new_ct" })]);
  });

  it("要圖形驗證：回 captcha 的參數；解完把結果送回來，組成 x-rpc-aigis 再登入", async () => {
    const captcha = { sessionId: "session-1", captchaId: "captcha-1", riskType: "slide" };
    const solved = { captcha_id: "captcha-1", lot_number: "lot", pass_token: "pass", gen_time: "1700000000", captcha_output: "out" };
    hoyolab.appLogin.mockResolvedValueOnce({ kind: "captcha", captcha }).mockResolvedValueOnce({ kind: "ok", stoken: "v2_stoken", mid: "mid_x", aid: "42" });

    expect(await loginAccount(me, FIELDS)).toEqual({ step: "captcha", captcha });
    await loginAccount(me, { ...FIELDS, aigis: JSON.stringify({ sessionId: "session-1", ...solved }) });

    expect(hoyolab.appLogin).toHaveBeenLastCalledWith({ ...FIELDS, aigis: aigisHeader("session-1", solved) });
  });

  it("好幾個伺服器都有角色：先回角色清單與換到的 cookie（含 stoken），讓使用者選，還不寫入", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([role(), role({ uid: "800000002", region: "prod_official_asia" })]));
    hoyolab.appLogin.mockResolvedValue({ kind: "ok", stoken: "v2_stoken", mid: "mid_x", aid: "42" });

    const result = await loginAccount(me, FIELDS);

    expect(result).toMatchObject({ step: "roles", cookie: expect.stringContaining("stoken=v2_stoken") });
    expect(await getDb().select().from(starrailAccounts)).toEqual([]);
  });

  it("email 驗證碼錯了：說明原因，不再登入", async () => {
    hoyolab.verifyEmailCode.mockResolvedValue({ ok: false, message: "email 驗證碼錯了或過期了，請重新輸入" });

    expect(await loginAccount(me, { ...FIELDS, verify: VERIFY, code: "000000" })).toEqual({ ok: false, error: "email 驗證碼錯了或過期了，請重新輸入" });
    expect(hoyolab.appLogin).not.toHaveBeenCalled();
  });

  it("帳號密碼錯誤或換不出 cookie：回錯誤，不連結", async () => {
    hoyolab.appLogin.mockResolvedValueOnce({ kind: "error", retcode: -3208, message: "帳號或密碼錯誤" });
    expect(await loginAccount(me, FIELDS)).toEqual({ ok: false, error: "帳號或密碼錯誤" });

    hoyolab.appLogin.mockResolvedValueOnce({ kind: "ok", stoken: "v2_stoken", mid: "mid_x", aid: "42" });
    hoyolab.tokensFromStoken.mockResolvedValueOnce({ ok: false, retcode: -100, message: "HoYoLAB 的登入已失效（代碼 -100），請重新登入" });
    expect(await loginAccount(me, FIELDS)).toMatchObject({ ok: false });
    expect(await getDb().select().from(starrailAccounts)).toEqual([]);
  });

  it.each([
    ["沒填帳號", { account: " " }],
    ["沒填密碼", { password: "" }],
    ["device id 格式不對", { deviceId: "../../etc" }],
    ["驗證碼不是數字", { verify: VERIFY, code: "12ab" }],
  ])("%s：直接擋下，不呼叫 HoYoverse", async (_name, overrides) => {
    expect(await loginAccount(me, { ...FIELDS, ...overrides })).toMatchObject({ ok: false });
    expect(hoyolab.appLogin).not.toHaveBeenCalled();
    expect(hoyolab.verifyEmailCode).not.toHaveBeenCalled();
  });

  it("第一步每人每小時最多 5 次（猜密碼沒有意義）；之後的圖形驗證與 email 驗證不算次數", async () => {
    hoyolab.appLogin.mockResolvedValue({ kind: "error", retcode: -3208, message: "帳號或密碼錯誤" });
    const now = new Date("2026-11-12T04:00:00Z");

    for (let i = 0; i < 5; i += 1) await loginAccount(me, FIELDS, now);
    const blocked = await loginAccount(me, FIELDS, now);
    await loginAccount(me, { ...FIELDS, verify: VERIFY, code: "123456" }, now);

    expect(blocked).toMatchObject({ ok: false, error: expect.stringContaining("太多次") });
    expect(hoyolab.appLogin).toHaveBeenCalledTimes(5);
    expect(hoyolab.verifyEmailCode).toHaveBeenCalledOnce();
    // 別人不受影響
    await loginAccount(other, FIELDS, now);
    expect(hoyolab.appLogin).toHaveBeenCalledTimes(6);
  });

  it("出錯時的 log 不寫帳號與密碼", async () => {
    const log = captureErrorLog();
    hoyolab.appLogin.mockRejectedValue(new Error(`boom ${PASSWORD}`));

    await expect(loginAccount(me, FIELDS)).rejects.toThrow();
    expect(loggedText(log)).not.toContain(PASSWORD);
    expect(loggedText(log)).not.toContain("me@example.com");
  });
});

describe("排程讀到登入過期：用 stoken 自動換新", () => {
  it("即時便箋回 -100、cookie 有 stoken：換新後再讀一次，同一個 HoYoLAB 帳號的每個角色都換成新的 cookie，不標失效", async () => {
    hoyolab.fetchGameRoles.mockResolvedValue(ok([role(), role({ uid: "800000002", region: "prod_official_asia" })]));
    await linkAccount(me, LOGGED_IN, "all");
    hoyolab.fetchDailyNote.mockResolvedValueOnce(EXPIRED).mockResolvedValueOnce(ok(dailyNote()));

    const result = await getDailyNote(await accountRow());

    expect(result.ok).toBe(true);
    expect(hoyolab.fetchDailyNote).toHaveBeenLastCalledWith(expect.stringContaining("ltoken_v2=v2_new_lt"), "900000001", "prod_official_cht");
    expect((await storedCookies()).every((cookie) => cookie.includes("ltoken_v2=v2_new_lt") && cookie.includes("cookie_token_v2=v2_new_ct") && cookie.includes("stoken=v2_stoken"))).toBe(true);
    expect((await accountRow()).cookieInvalid).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("換新也失敗（例如改了密碼）：標失效、寄一次網站通知請你重新登入；下一輪還是失敗不再寄", async () => {
    await linkAccount(me, LOGGED_IN);
    hoyolab.fetchDailyNote.mockResolvedValue(EXPIRED);
    hoyolab.tokensFromStoken.mockResolvedValue({ ok: false, retcode: -100, message: "HoYoLAB 的登入已失效（代碼 -100），請重新登入" });

    await getDailyNote(await accountRow());
    await getDailyNote(await accountRow());

    expect((await accountRow()).cookieInvalid).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ recipients: [me], module: "starrail", kind: "login_expired", url: "/starrail" }));
  });

  it("換新時連不上 HoYoLAB（暫時的）：不當成登入失效，不寄通知，下一輪再試", async () => {
    await linkAccount(me, LOGGED_IN);
    hoyolab.fetchDailyNote.mockResolvedValue(EXPIRED);
    hoyolab.tokensFromStoken.mockResolvedValue({ ok: false, retcode: null, message: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" });

    await getDailyNote(await accountRow());

    expect(notify).not.toHaveBeenCalled();
  });

  it("貼上的 cookie（沒有 stoken）：照舊標失效，不換新也不寄登入過期的通知", async () => {
    await linkAccount(me, COOKIE);
    hoyolab.fetchDailyNote.mockResolvedValue(EXPIRED);

    await getDailyNote(await accountRow());

    expect(hoyolab.tokensFromStoken).not.toHaveBeenCalled();
    expect((await accountRow()).cookieInvalid).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("簽到讀到登入過期：換新後接著簽", () => {
  const SIGNED = { result: "success", message: "簽到成功", cookieInvalid: false, retcode: 0 };

  it("讀簽到資訊回 -100、cookie 有 stoken：換新後用新的 cookie 再讀、再簽到，不標失效", async () => {
    await linkAccount(me, LOGGED_IN);
    hoyolab.fetchCheckinInfo.mockResolvedValueOnce(EXPIRED).mockResolvedValueOnce(ok({ isSigned: false, totalSignDay: 3 }));
    hoyolab.signIn.mockResolvedValue(SIGNED);

    expect(await checkin(await accountRow())).toMatchObject({ ok: true });
    expect(hoyolab.signIn).toHaveBeenCalledWith(expect.stringContaining("ltoken_v2=v2_new_lt"));
    expect((await accountRow()).cookieInvalid).toBe(false);
  });

  it("換新也失敗：標失效並寄一次登入失效的通知", async () => {
    await linkAccount(me, LOGGED_IN);
    hoyolab.fetchCheckinInfo.mockResolvedValue(EXPIRED);
    hoyolab.signIn.mockResolvedValue({ result: "failed", message: "cookie 已失效", cookieInvalid: true, retcode: -100 });
    hoyolab.tokensFromStoken.mockResolvedValue({ ok: false, retcode: -100, message: "失效" });

    expect(await checkin(await accountRow())).toMatchObject({ ok: false });
    expect((await accountRow()).cookieInvalid).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "login_expired" }));
  });
});

describe("頁面讀到登入過期：在回應後換新（refreshOwnCookie）", () => {
  it("讀取的結果標著可以自動換新，訊息請你重新整理；沒有 stoken 的照原本的訊息", async () => {
    await linkAccount(me, LOGGED_IN);
    const { id } = await accountRow();
    hoyolab.fetchDailyNote.mockResolvedValue(EXPIRED);
    hoyolab.fetchCharacters.mockResolvedValue(EXPIRED);

    expect(await dailyNoteFor(me, id)).toMatchObject({ ok: false, loginExpired: true, message: expect.stringContaining("重新整理") });
    expect(await charactersFor(me, id)).toMatchObject({ ok: false, loginExpired: true });

    await linkAccount(me, COOKIE);
    expect(await charactersFor(me, id)).toMatchObject({ ok: false, loginExpired: false, message: "cookie 已失效" });
  });

  it("換新成功：存新的 cookie、讓帳號的快取失效；一分鐘內好幾塊同時要換只換一次", async () => {
    await linkAccount(me, LOGGED_IN);
    const { id } = await accountRow();

    expect(await refreshOwnCookie(me, id)).toBe("refreshed");
    expect(await refreshOwnCookie(me, id)).toBe("skipped");

    expect(hoyolab.tokensFromStoken).toHaveBeenCalledOnce();
    expect(expiredTags()).toContain(starrailTags.accounts);
    expect((await storedCookies())[0]).toContain("ltoken_v2=v2_new_lt");
  });

  it("換新也失敗：標失效並寄一次通知", async () => {
    await linkAccount(me, LOGGED_IN);
    hoyolab.tokensFromStoken.mockResolvedValue({ ok: false, retcode: -100, message: "失效" });

    expect(await refreshOwnCookie(me, (await accountRow()).id)).toBe("expired");
    expect((await accountRow()).cookieInvalid).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("已經標成失效（換新失敗過）：頁面不再換新，免得每次打開都問一次；排程每小時照樣會試", async () => {
    await linkAccount(me, LOGGED_IN);
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });

    expect(await refreshOwnCookie(me, (await accountRow()).id)).toBe("skipped");
    expect(hoyolab.tokensFromStoken).not.toHaveBeenCalled();
  });

  it("別人的帳號 id：當作不存在，不換新", async () => {
    await linkAccount(me, LOGGED_IN);

    expect(await refreshOwnCookie(other, (await accountRow()).id)).toBe("skipped");
    expect(hoyolab.tokensFromStoken).not.toHaveBeenCalled();
  });
});
