import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";

stubCoreEnv();

const IP = "198.51.100.23";
const CODE = "C".repeat(43);

const background = vi.hoisted(() => ({ tasks: [] as Array<() => unknown>, connection: vi.fn(async () => {}) }));
vi.mock("next/server", () => ({ after: (task: () => unknown) => void background.tasks.push(task), connection: background.connection }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": IP }) }));
vi.mock("./actions", () => ({ registerAction: vi.fn(), logout: vi.fn() }));
vi.mock(".", () => ({ currentSession: vi.fn() }));
vi.mock("./invites", { spy: true });
vi.mock("./attempts", { spy: true });

const session = mocksOf(await import("."), "currentSession");
const invites = mocksOf(await import("./invites"), "findUsableInvite");
const attempts = mocksOf(await import("./attempts"), "checkAttempts", "recordAttempt");
const { INVITE_FAILURES, clientKey } = await import("./attempts");
const { INVITE_INVALID_MESSAGE } = await import("./registration");
const { RegisterGate } = await import("./register-page");

const render = async (params: Record<string, string | string[] | undefined>) =>
  renderToStaticMarkup((await RegisterGate({ searchParams: Promise.resolve(params) })) as ReactElement);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
/** React 輸出的屬性順序跟寫法不一定一樣，找一個同時帶著這些屬性的 input */
const hasInput = (markup: string, ...attributes: string[]) => (markup.match(/<input[^>]*>/g) ?? []).some((tag) => attributes.every((a) => tag.includes(a)));

beforeEach(() => {
  background.tasks = [];
  background.connection.mockReset().mockResolvedValue(undefined);
  session.currentSession.mockReset().mockResolvedValue(null);
  invites.findUsableInvite.mockReset().mockResolvedValue({ id: 1, expiresAt: new Date("2026-10-15T01:30:00Z") });
  attempts.checkAttempts.mockReset().mockResolvedValue({ allowed: true });
  attempts.recordAttempt.mockReset().mockResolvedValue({ allowed: true });
});

describe("註冊頁", () => {
  it("有效的邀請_顯示表單：帳號、密碼兩次、同意聲明（連到 /terms）、蜜罐欄位與隱藏的邀請碼", async () => {
    const markup = await render({ code: CODE });

    expect(invites.findUsableInvite).toHaveBeenCalledWith(CODE, expect.any(Date));
    expect(markup).toContain('name="username"');
    expect(markup.match(/type="password"/g)).toHaveLength(2);
    expect(markup).toContain('name="confirmPassword"');
    expect(markup).toMatch(/autoComplete="new-password"|autocomplete="new-password"/i);
    expect(hasInput(markup, 'type="checkbox"', 'name="agree"', "required")).toBe(true);
    expect(markup).toContain('href="/terms"');
    expect(hasInput(markup, 'type="hidden"', 'name="code"', `value="${CODE}"`)).toBe(true);
    expect(hasInput(markup, 'name="website"', 'tabindex="-1"', 'autoComplete="off"')).toBe(true);
    expect(markup).toMatch(/<div aria-hidden="true"[^>]*><label>[^<]*<input[^>]*name="website"/);
    expect(textOf(markup)).toContain("2026/10/15 09:30");
    expect(background.tasks).toHaveLength(0);
  });

  it("表單有圖形驗證碼（圖片、換一張、輸入框）與兩個顯示密碼按鈕", async () => {
    const markup = await render({ code: CODE });

    const image = markup.match(/<img[^>]*>/)![0];
    expect(image).toContain('alt="驗證碼圖片"');
    expect(image).toMatch(/src="\/api\/auth\/captcha\?for=register&amp;t=\d+"/);
    expect(hasInput(markup, 'name="captcha"', 'autoComplete="off"', 'autoCapitalize="characters"', 'spellCheck="false"')).toBe(true);
    expect(markup).toMatch(/<button type="button"[^>]*>.*?換一張/);
    expect(markup.match(/aria-label="顯示密碼"/g)).toHaveLength(2);
  });

  it("沒有邀請碼（或帶了好幾個）_說明要用站長的邀請連結，沒有表單也不查資料庫", async () => {
    for (const params of [{}, { code: "" }, { code: [CODE, CODE] }]) {
      const markup = await render(params);

      expect(textOf(markup)).toContain("需要站長的邀請連結才能註冊");
      expect(markup).not.toMatch(/<form|<input/);
    }
    expect(invites.findUsableInvite).not.toHaveBeenCalled();
    expect(attempts.checkAttempts).not.toHaveBeenCalled();
  });

  it("邀請無效_顯示同一句說明、沒有表單，回應後再記一次邀請碼失敗（用 IP 的雜湊）", async () => {
    invites.findUsableInvite.mockResolvedValue(null);

    const markup = await render({ code: CODE });

    expect(textOf(markup)).toContain(INVITE_INVALID_MESSAGE);
    expect(markup).not.toMatch(/<form|<input/);
    expect(attempts.recordAttempt).not.toHaveBeenCalled();
    await Promise.all(background.tasks.map((task) => task()));
    expect(attempts.recordAttempt).toHaveBeenCalledWith(INVITE_FAILURES, clientKey(IP), expect.any(Date));
  });

  it("這個 IP 的無效邀請碼太多次_先擋下，不查邀請", async () => {
    attempts.checkAttempts.mockResolvedValue({ allowed: false, retryAfterMs: 20 * 60_000 });

    const markup = await render({ code: CODE });

    expect(textOf(markup)).toContain("嘗試次數太多，請 20 分鐘後再試");
    expect(invites.findUsableInvite).not.toHaveBeenCalled();
    expect(markup).not.toMatch(/<input/);
  });

  it("預先抓取或預先算繪時（connection 等不到真正的請求）_不查邀請、不記失敗次數", async () => {
    background.connection.mockReturnValue(new Promise(() => {}));

    void RegisterGate({ searchParams: Promise.resolve({ code: CODE }) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(attempts.checkAttempts).not.toHaveBeenCalled();
    expect(invites.findUsableInvite).not.toHaveBeenCalled();
    expect(background.tasks).toHaveLength(0);
  });

  it("已經登入_提示先登出（避免不小心換掉目前的帳號），不顯示註冊表單", async () => {
    session.currentSession.mockResolvedValue({ id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice", role: "owner" });

    const markup = await render({ code: CODE });

    expect(textOf(markup)).toContain("目前已用 alice 登入");
    expect(markup).not.toContain('name="password"');
    expect(invites.findUsableInvite).not.toHaveBeenCalled();
  });

  it("資料庫出錯_顯示稍後再試，log 只記錯誤種類、不含邀請碼", async () => {
    const log = captureErrorLog();
    invites.findUsableInvite.mockRejectedValue(Object.assign(new Error(`select ... ${CODE}`), { name: "PostgresError" }));

    const markup = await render({ code: CODE });

    expect(textOf(markup)).toContain("暫時無法檢查邀請連結，請稍後再試");
    expect(loggedText(log)).toContain("PostgresError");
    expect(loggedText(log)).not.toContain(CODE);
  });

  it("背景記錄失敗_只記 log，不影響畫面", async () => {
    const log = captureErrorLog();
    invites.findUsableInvite.mockResolvedValue(null);
    attempts.recordAttempt.mockRejectedValue(Object.assign(new Error("db down"), { name: "PostgresError" }));

    await render({ code: CODE });
    await Promise.all(background.tasks.map((task) => task()));

    expect(loggedText(log)).toContain("PostgresError");
  });
});
