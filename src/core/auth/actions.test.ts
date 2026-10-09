import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

const SECRET = "s".repeat(32);
const USER_ID = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "plum blossom 2026";

stubCoreEnv({ SESSION_SECRET: SECRET });

/** 假的 cookie 與 header：next/headers 只能在請求裡用 */
const request = vi.hoisted(() => ({
  ip: "203.0.113.1",
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": request.ip }),
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

const users = vi.hoisted(() => ({ authenticate: vi.fn(), changePassword: vi.fn(), findSessionUser: vi.fn(), hasAnyUser: vi.fn(), deleteOwnAccount: vi.fn() }));
vi.mock("./users", () => users);
// 驗證碼本身另外測；這裡預設答對，專心測登入流程
vi.mock("./captcha", { spy: true });

const captcha = mocksOf(await import("./captcha"), "takeCaptchaToken", "verifyCaptcha");
const { changePasswordAction, deleteAccountAction, login, logout } = await import("./actions");
const { SESSION_COOKIE, signSession, verifySessionToken } = await import("./session");

let ipSeq = 0;
beforeEach(() => {
  // 失敗次數限制是模組層級的狀態，每個測試換一個 IP 才不會互相影響
  request.ip = `203.0.113.${++ipSeq}`;
  request.jar.clear();
  Object.values(users).forEach((fn) => fn.mockReset());
  captcha.takeCaptchaToken.mockReset().mockResolvedValue("captcha-token");
  captcha.verifyCaptcha.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

/** 登入失敗會故意等 1 秒，測試用假時鐘快轉 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const result = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(1000);
  const outcome = await result;
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

describe("login", () => {
  it("帳號密碼正確_設定 session cookie（sub=使用者 id、ver=session 版本）並導向首頁", async () => {
    users.authenticate.mockResolvedValue({ id: USER_ID, sessionVersion: 4 });

    await expect(login({}, form({ username: "Alice", password: PASSWORD }))).rejects.toThrow("NEXT_REDIRECT:/");

    expect(users.authenticate).toHaveBeenCalledWith("Alice", PASSWORD);
    const cookie = request.jar.get(SESSION_COOKIE)!;
    expect(await verifySessionToken(cookie.value, SECRET)).toEqual({ userId: USER_ID, version: 4 });
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("帳號不存在與密碼錯誤_訊息一樣都是「帳號或密碼錯誤」_不設 cookie_保留帳號欄位", async () => {
    users.authenticate.mockResolvedValue(null);

    const state = await settle(login({}, form({ username: "nobody", password: PASSWORD })));

    expect(state).toEqual({ error: "帳號或密碼錯誤", username: "nobody" });
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("登入失敗會等 1 秒才回應（拖慢連續猜測）", async () => {
    users.authenticate.mockResolvedValue(null);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let done = false;
    const pending = login({}, form({ username: "alice", password: "wrong" })).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });

  it("同一個 IP 錯 5 次_第 6 次就算密碼正確也先擋下", async () => {
    users.authenticate.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) await settle(login({}, form({ username: "alice", password: "wrong" })));
    users.authenticate.mockResolvedValue({ id: USER_ID, sessionVersion: 1 });

    const state = await login({}, form({ username: "alice", password: PASSWORD }));

    expect(state.error).toMatch(/^錯誤次數太多，請 \d+ 分鐘後再試$/);
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
    expect(users.authenticate).toHaveBeenCalledTimes(5);
  });

  it("驗證碼用這次表單的答案與 cookie 驗證（cookie 每次都取出並清掉）", async () => {
    users.authenticate.mockResolvedValue({ id: USER_ID, sessionVersion: 1 });

    await login({}, form({ username: "alice", password: PASSWORD, captcha: "k7mrx" })).catch(() => {});

    expect(captcha.takeCaptchaToken).toHaveBeenCalledWith("login");
    expect(captcha.verifyCaptcha).toHaveBeenCalledWith("login", "k7mrx", "captcha-token");
  });

  it("驗證碼錯誤_回「驗證碼錯誤，請重新輸入」；還沒檢查密碼，不算帳號的失敗次數", async () => {
    captcha.verifyCaptcha.mockResolvedValue(false);

    expect(await login({}, form({ username: "alice", password: PASSWORD, captcha: "AAAAA" }))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "alice" });
    expect(users.authenticate).not.toHaveBeenCalled();
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("驗證碼錯誤也算這個 IP 的一次失敗：錯 5 次後就先擋下", async () => {
    captcha.verifyCaptcha.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) await login({}, form({ username: "alice", password: PASSWORD, captcha: "AAAAA" }));
    captcha.verifyCaptcha.mockResolvedValue(true);
    users.authenticate.mockResolvedValue({ id: USER_ID, sessionVersion: 1 });

    const state = await login({}, form({ username: "alice", password: PASSWORD, captcha: "K7MRX" }));

    expect(state.error).toMatch(/^錯誤次數太多，請 \d+ 分鐘後再試$/);
    expect(users.authenticate).not.toHaveBeenCalled();
  });

  it("被 IP 擋下時也清掉驗證碼 cookie（每次送出後都換一張）", async () => {
    users.authenticate.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) await settle(login({}, form({ username: "alice", password: "wrong", captcha: "K7MRX" })));
    captcha.takeCaptchaToken.mockClear();

    await login({}, form({ username: "alice", password: PASSWORD, captcha: "K7MRX" }));

    expect(captcha.takeCaptchaToken).toHaveBeenCalledWith("login");
  });

  it("帳號已停用（密碼正確才會知道）_說明已停用、不設 cookie", async () => {
    users.authenticate.mockResolvedValue({ id: USER_ID, sessionVersion: 1, disabled: true });

    const state = await login({}, form({ username: "alice", password: PASSWORD }));

    expect(state).toEqual({ error: "這個帳號已停用，請聯絡站長", username: "alice" });
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("資料庫出錯_回摘要不丟例外_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    const error = new Error("connect ECONNREFUSED postgresql://postgres:db-secret@host");
    error.name = "PostgresError";
    users.authenticate.mockRejectedValue(error);

    const state = await login({}, form({ username: "alice", password: PASSWORD }));

    expect(state.error).toBe("暫時無法登入，請稍後再試");
    expect(JSON.stringify(log.mock.calls)).not.toContain("db-secret");
    expect(JSON.stringify(log.mock.calls)).toContain("PostgresError");
  });
});

describe("changePasswordAction", () => {
  async function loggedIn(userId = USER_ID, version = 1) {
    request.jar.set(SESSION_COOKIE, { value: await signSession({ userId, version }, SECRET) });
    users.findSessionUser.mockImplementation(async (claims: { userId: string; version: number }) =>
      claims.userId === userId && claims.version === version ? { id: userId, username: "alice" } : null,
    );
  }
  const passwords = (current: string, next: string, confirm = next) => form({ currentPassword: current, newPassword: next, confirmPassword: confirm });

  it("沒登入_導向登入頁_不變更", async () => {
    users.findSessionUser.mockResolvedValue(null);

    await expect(changePasswordAction({}, passwords(PASSWORD, NEW_PASSWORD))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(users.changePassword).not.toHaveBeenCalled();
  });

  it("兩次輸入的新密碼不一樣_不變更", async () => {
    await loggedIn();

    expect(await changePasswordAction({}, passwords(PASSWORD, NEW_PASSWORD, `${NEW_PASSWORD}!`))).toEqual({ error: "兩次輸入的新密碼不一樣" });
    expect(users.changePassword).not.toHaveBeenCalled();
  });

  it("成功_遞增後的 session 版本重新簽發這台裝置的 cookie", async () => {
    await loggedIn();
    users.changePassword.mockResolvedValue({ ok: true, sessionVersion: 2 });

    const state = await changePasswordAction({}, passwords(PASSWORD, NEW_PASSWORD));

    expect(users.changePassword).toHaveBeenCalledWith(USER_ID, PASSWORD, NEW_PASSWORD);
    expect(state).toEqual({ message: "已變更密碼。這台裝置保持登入，其他裝置都已登出。" });
    expect(await verifySessionToken(request.jar.get(SESSION_COOKIE)!.value, SECRET)).toEqual({ userId: USER_ID, version: 2 });
  });

  it("目前密碼錯誤_回錯誤訊息_cookie 不變", async () => {
    await loggedIn();
    const before = request.jar.get(SESSION_COOKIE)!.value;
    users.changePassword.mockResolvedValue({ ok: false, reason: "wrong_password", error: "目前的密碼不正確" });

    expect(await changePasswordAction({}, passwords("wrong password!!", NEW_PASSWORD))).toEqual({ error: "目前的密碼不正確" });
    expect(request.jar.get(SESSION_COOKIE)!.value).toBe(before);
  });

  it("目前密碼連續錯 5 次_先鎖住，不再驗證（依帳號計算，換 IP 也一樣）", async () => {
    // 失敗次數依帳號累計，用另一個帳號才不會被前面的測試影響
    await loggedIn("0b6f3c1e-9d2a-4f6b-8c7d-2e3f4a5b6c7d");
    users.changePassword.mockResolvedValue({ ok: false, reason: "wrong_password", error: "目前的密碼不正確" });
    for (let i = 0; i < 5; i++) {
      request.ip = `198.51.100.${i}`;
      await changePasswordAction({}, passwords("wrong password!!", NEW_PASSWORD));
    }

    request.ip = "198.51.100.99";
    const state = await changePasswordAction({}, passwords(PASSWORD, NEW_PASSWORD));

    expect(state.error).toMatch(/^錯誤次數太多，請 \d+ 分鐘後再試$/);
    expect(users.changePassword).toHaveBeenCalledTimes(5);
  });

  it("資料庫出錯_回摘要不丟例外", async () => {
    captureErrorLog();
    await loggedIn();
    users.changePassword.mockRejectedValue(new Error("db down"));

    expect(await changePasswordAction({}, passwords(PASSWORD, NEW_PASSWORD))).toEqual({ error: "變更密碼失敗（詳見伺服器 log）" });
  });
});

describe("deleteAccountAction", () => {
  const OTHER_USER = "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  async function loggedIn(userId = USER_ID) {
    request.jar.set(SESSION_COOKIE, { value: await signSession({ userId, version: 1 }, SECRET) });
    users.findSessionUser.mockImplementation(async (claims: { userId: string }) => (claims.userId === userId ? { id: userId, username: "alice", role: "member" } : null));
  }

  it("沒登入_導向登入頁_不刪除", async () => {
    users.findSessionUser.mockResolvedValue(null);

    await expect(deleteAccountAction({}, form({ password: PASSWORD }))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(users.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("密碼正確_刪除帳號、刪掉這台裝置的 cookie，導向登入頁並說明已刪除", async () => {
    await loggedIn();
    users.deleteOwnAccount.mockResolvedValue({ ok: true });

    await expect(deleteAccountAction({}, form({ password: PASSWORD }))).rejects.toThrow("NEXT_REDIRECT:/login?deleted=1");

    expect(users.deleteOwnAccount).toHaveBeenCalledWith(USER_ID, PASSWORD);
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("密碼錯誤或唯一的站長_顯示原因、cookie 不變", async () => {
    await loggedIn();
    const before = request.jar.get(SESSION_COOKIE)!.value;
    users.deleteOwnAccount.mockResolvedValueOnce({ ok: false, reason: "wrong_password", error: "密碼不正確" });
    users.deleteOwnAccount.mockResolvedValueOnce({ ok: false, reason: "last_owner", error: "你是唯一的站長，不能刪除自己的帳號" });

    expect(await deleteAccountAction({}, form({ password: "wrong password!!" }))).toEqual({ error: "密碼不正確" });
    expect(await deleteAccountAction({}, form({ password: PASSWORD }))).toEqual({ error: "你是唯一的站長，不能刪除自己的帳號" });
    expect(request.jar.get(SESSION_COOKIE)!.value).toBe(before);
  });

  it("密碼連續錯 5 次_先鎖住，不再驗證（跟改密碼共用、依帳號計算）", async () => {
    await loggedIn(OTHER_USER);
    users.deleteOwnAccount.mockResolvedValue({ ok: false, reason: "wrong_password", error: "密碼不正確" });
    for (let i = 0; i < 5; i++) await deleteAccountAction({}, form({ password: "wrong password!!" }));

    const state = await deleteAccountAction({}, form({ password: PASSWORD }));

    expect(state.error).toMatch(/^錯誤次數太多，請 \d+ 分鐘後再試$/);
    expect(users.deleteOwnAccount).toHaveBeenCalledTimes(5);
  });

  it("資料庫出錯_回摘要不丟例外、不刪 cookie", async () => {
    captureErrorLog();
    await loggedIn();
    users.deleteOwnAccount.mockRejectedValue(new Error("db down"));

    expect(await deleteAccountAction({}, form({ password: PASSWORD }))).toEqual({ error: "刪除帳號失敗（詳見伺服器 log）" });
    expect(request.jar.has(SESSION_COOKIE)).toBe(true);
  });
});

describe("logout", () => {
  it("刪掉這台裝置的 cookie 並導向登入頁", async () => {
    request.jar.set(SESSION_COOKIE, { value: "token" });

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });
});
