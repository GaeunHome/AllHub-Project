import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

const SECRET = "s".repeat(32);
const NEW_USER = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const CODE = "A".repeat(43);
const PASSWORD = "plum blossom 2026";
const IP = "203.0.113.9";

stubCoreEnv({ SESSION_SECRET: SECRET });

const request = vi.hoisted(() => ({ ip: "203.0.113.9", jar: new Map<string, { value: string; options?: Record<string, unknown> }>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${request.ip}, 10.0.0.1` }),
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void request.jar.set(name, { value, options }),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("./registration", { spy: true });
vi.mock("./attempts", { spy: true });
vi.mock("./captcha", { spy: true });

const { INVITE_INVALID_MESSAGE } = await import("./registration");
const registration = mocksOf(await import("./registration"), "registerMember");
const attempts = mocksOf(await import("./attempts"), "checkAttempts", "recordAttempt");
const captcha = mocksOf(await import("./captcha"), "takeCaptchaToken", "verifyCaptcha");
const { INVITE_FAILURES, REGISTER_ATTEMPTS, clientKey } = await import("./attempts");
const { registerAction } = await import("./actions");
const { SESSION_COOKIE, verifySessionToken } = await import("./session");

const fields = (overrides: Record<string, string> = {}) =>
  form({ code: CODE, username: "bob", password: PASSWORD, confirmPassword: PASSWORD, agree: "on", website: "", captcha: "K7MRX", ...overrides });

beforeEach(() => {
  request.ip = IP;
  request.jar.clear();
  registration.registerMember.mockReset().mockResolvedValue({ ok: true, id: NEW_USER, sessionVersion: 1 });
  attempts.checkAttempts.mockReset().mockResolvedValue({ allowed: true });
  attempts.recordAttempt.mockReset().mockResolvedValue({ allowed: true });
  captcha.takeCaptchaToken.mockReset().mockResolvedValue("captcha-token");
  captcha.verifyCaptcha.mockReset().mockResolvedValue(true);
});

describe("registerAction", () => {
  it("成功_建立帳號後直接登入（cookie 帶新帳號的 id）並導向首頁", async () => {
    await expect(registerAction({}, fields({ username: "Bob" }))).rejects.toThrow("NEXT_REDIRECT:/");

    expect(registration.registerMember).toHaveBeenCalledWith({ code: CODE, username: "Bob", password: PASSWORD, confirmPassword: PASSWORD }, expect.any(Date));
    expect(await verifySessionToken(request.jar.get(SESSION_COOKIE)!.value, SECRET)).toEqual({ userId: NEW_USER, version: 1 });
  });

  it("每次送出都記一次嘗試（依 IP 的雜湊，不是原本的 IP）", async () => {
    await registerAction({}, fields()).catch(() => {});

    expect(attempts.recordAttempt).toHaveBeenCalledWith(REGISTER_ATTEMPTS, clientKey(IP), expect.any(Date));
    expect(JSON.stringify(attempts.recordAttempt.mock.calls)).not.toContain(IP);
  });

  it("同一個 IP 嘗試太多次_先擋下，不檢查邀請也不建立帳號", async () => {
    attempts.recordAttempt.mockResolvedValue({ allowed: false, retryAfterMs: 30 * 60_000 });

    expect(await registerAction({}, fields())).toEqual({ error: "嘗試次數太多，請 30 分鐘後再試" });
    expect(registration.registerMember).not.toHaveBeenCalled();
  });

  it("蜜罐欄位有值（機器人才會填）_拒絕，不建立帳號；嘗試照樣記一次", async () => {
    expect(await registerAction({}, fields({ website: "https://spam.example" }))).toEqual({ error: "無法完成註冊，請重新整理頁面再試一次" });

    expect(registration.registerMember).not.toHaveBeenCalled();
    expect(attempts.recordAttempt).toHaveBeenCalledWith(REGISTER_ATTEMPTS, expect.any(String), expect.any(Date));
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("驗證碼錯誤_回「驗證碼錯誤，請重新輸入」，不建立帳號，也不算邀請碼失敗", async () => {
    captcha.verifyCaptcha.mockResolvedValue(false);

    expect(await registerAction({}, fields({ captcha: "AAAAA" }))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "bob" });
    expect(captcha.verifyCaptcha).toHaveBeenCalledWith("register", "AAAAA", "captcha-token", expect.any(Date));
    expect(registration.registerMember).not.toHaveBeenCalled();
    expect(attempts.recordAttempt).not.toHaveBeenCalledWith(INVITE_FAILURES, expect.anything(), expect.anything());
  });

  it("蜜罐先檢查：蜜罐有值時不看驗證碼", async () => {
    await registerAction({}, fields({ website: "https://spam.example" }));

    expect(captcha.verifyCaptcha).not.toHaveBeenCalled();
  });

  it("每次送出都取出並清掉驗證碼 cookie（成功、被次數限制擋下、蜜罐都一樣）", async () => {
    await registerAction({}, fields()).catch(() => {});
    attempts.recordAttempt.mockResolvedValueOnce({ allowed: false, retryAfterMs: 60_000 });
    await registerAction({}, fields());
    await registerAction({}, fields({ website: "x" }));

    expect(captcha.takeCaptchaToken).toHaveBeenCalledTimes(3);
    expect(captcha.takeCaptchaToken).toHaveBeenCalledWith("register");
  });

  it("沒有勾選同意聲明_不建立帳號、保留帳號欄位", async () => {
    expect(await registerAction({}, fields({ agree: "" }))).toEqual({ error: "請先閱讀並勾選同意使用聲明", username: "bob" });
    expect(registration.registerMember).not.toHaveBeenCalled();
  });

  it("這個 IP 的無效邀請碼已經太多次_連有效的也先不受理", async () => {
    attempts.checkAttempts.mockResolvedValue({ allowed: false, retryAfterMs: 5 * 60_000 });

    expect(await registerAction({}, fields())).toEqual({ error: "嘗試次數太多，請 5 分鐘後再試" });
    expect(attempts.checkAttempts).toHaveBeenCalledWith(INVITE_FAILURES, clientKey(IP), expect.any(Date));
    expect(registration.registerMember).not.toHaveBeenCalled();
  });

  it("邀請無效_記一次邀請碼失敗、顯示同一句說明、保留帳號欄位", async () => {
    registration.registerMember.mockResolvedValue({ ok: false, reason: "invite", error: INVITE_INVALID_MESSAGE });

    expect(await registerAction({}, fields())).toEqual({ error: INVITE_INVALID_MESSAGE, username: "bob" });
    expect(attempts.recordAttempt).toHaveBeenCalledWith(INVITE_FAILURES, clientKey(IP), expect.any(Date));
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("帳號已經有人用或密碼不合規則_顯示原因，不算邀請碼失敗", async () => {
    registration.registerMember.mockResolvedValueOnce({ ok: false, reason: "taken", error: "這個帳號已經有人使用，請換一個" });
    registration.registerMember.mockResolvedValueOnce({ ok: false, reason: "invalid", error: "密碼不能包含帳號名稱" });

    expect(await registerAction({}, fields())).toEqual({ error: "這個帳號已經有人使用，請換一個", username: "bob" });
    expect(await registerAction({}, fields())).toEqual({ error: "密碼不能包含帳號名稱", username: "bob" });
    expect(attempts.recordAttempt).not.toHaveBeenCalledWith(INVITE_FAILURES, expect.anything(), expect.anything());
  });

  it("資料庫出錯_回摘要不丟例外_log 只記錯誤種類、不含密碼與邀請碼", async () => {
    const log = captureErrorLog();
    registration.registerMember.mockRejectedValue(Object.assign(new Error(`insert failed: ${PASSWORD} ${CODE}`), { name: "PostgresError" }));

    expect(await registerAction({}, fields())).toEqual({ error: "暫時無法註冊，請稍後再試", username: "bob" });
    expect(loggedText(log)).toContain("PostgresError");
    expect(loggedText(log)).not.toContain(PASSWORD);
    expect(loggedText(log)).not.toContain(CODE);
  });
});
