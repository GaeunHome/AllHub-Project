import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/login", { spy: true });

const { loginAccount } = mocksOf(await import("../../service/login"), "loginAccount");
const { loginAccountAction } = await import("../actions");

const PASSWORD = "Sup3r-secret-pw";
const FIELDS = { account: "me@example.com", password: PASSWORD, deviceId: "abcdefghij123456" };
const CAPTCHA = { sessionId: "session-1", captchaId: "captcha-1", riskType: "slide" };
const VERIFY = '{"risk_ticket":"rt-1","verify_str":"{}"}';
const ROLES = [{ uid: "900000001", nickname: "開拓者", server: "台港澳服", level: 70, selected: true }];

beforeEach(() => {
  requireSession.mockReset();
  loginAccount.mockReset().mockResolvedValue({ ok: true, message: "已連結 開拓者（台港澳服，900000001）", accountId: 9 });
});

// 使用者要的 用帳號密碼登入 cookie 之後能自動換新
describe("loginAccountAction：用 HoYoverse 帳號密碼連結", () => {
  it("先檢查登入；沒登入時不送出帳號密碼", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(loginAccountAction({}, form(FIELDS))).rejects.toThrow("NEXT_REDIRECT");
    expect(loginAccount).not.toHaveBeenCalled();
  });

  it("用登入者的 id 呼叫 service，帶著表單的帳號、密碼、device id 與驗證的結果", async () => {
    await loginAccountAction({}, form({ ...FIELDS, verify: VERIFY, code: " 123456 " }));

    expect(loginAccount).toHaveBeenCalledWith(TEST_SESSION.id, { ...FIELDS, verify: VERIFY, code: "123456" });
  });

  it.each([
    // Geetest 的程式網址經 externalAssetUrl 開發時改寫到假伺服器
    ["要圖形驗證", { step: "captcha", captcha: CAPTCHA }, { captcha: { ...CAPTCHA, script: "https://static.geetest.com/v4/gt4.js" } }],
    ["要 email 驗證", { step: "email", verify: VERIFY }, { verify: VERIFY }],
    ["好幾個伺服器都有角色", { step: "roles", roles: ROLES, cookie: "ltoken_v2=x; stoken=y" }, { roles: ROLES, cookie: "ltoken_v2=x; stoken=y" }],
  ])("%s_回傳下一步，還沒寫入就不讓快取失效", async (_name, result, state) => {
    loginAccount.mockResolvedValue(result);

    expect(await loginAccountAction({}, form(FIELDS))).toEqual(state);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("只有一個角色（service 直接連結）_成功訊息、剛連結的帳號 id 與提醒；帳號的快取失效", async () => {
    loginAccount.mockResolvedValue({ ok: true, message: "已連結 開拓者（台港澳服，900000001）", warning: "提醒", accountId: 9 });

    expect(await loginAccountAction({}, form(FIELDS))).toEqual({ message: "已連結 開拓者（台港澳服，900000001）", warning: "提醒", accountId: 9 });
    expect(updated()).toEqual(["starrail:accounts"]);
  });

  it("密碼錯這類 service 回的錯誤_原樣顯示，沒寫入就不讓快取失效", async () => {
    loginAccount.mockResolvedValue({ ok: false, error: "帳號或密碼錯誤" });

    expect(await loginAccountAction({}, form(FIELDS))).toEqual({ error: "帳號或密碼錯誤" });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("非預期錯誤_回摘要；log 不記帳號與密碼", async () => {
    const log = captureErrorLog();
    loginAccount.mockRejectedValue(Object.assign(new Error(`boom ${FIELDS.account} ${PASSWORD}`), { name: "DrizzleQueryError" }));

    expect((await loginAccountAction({}, form(FIELDS))).error).toContain("詳見伺服器 log");
    expect(loggedText(log)).not.toContain(PASSWORD);
    expect(loggedText(log)).not.toContain(FIELDS.account);
  });
});
