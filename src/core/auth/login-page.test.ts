import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog } from "@/dev/test-helpers";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./actions", () => ({ login: vi.fn() }));
const users = vi.hoisted(() => ({ hasAnyUser: vi.fn() }));
vi.mock("./users", () => users);

const { DeletedNotice, LoginFooter, LoginGate } = await import("./login-page");

const html = async () => renderToStaticMarkup((await LoginGate()) as ReactElement);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

beforeEach(() => {
  users.hasAnyUser.mockReset();
});

describe("登入頁", () => {
  it("資料庫裡還沒有帳號_提示到電腦用命令列建立_不提供網頁註冊", async () => {
    users.hasAnyUser.mockResolvedValue(false);

    const markup = await html();

    expect(textOf(markup)).toContain("尚未建立帳號，請在電腦執行 npm run account create");
    expect(markup).not.toContain('name="password"');
    expect(markup).not.toMatch(/<form|<input|<button/);
  });

  it("有帳號_表單有圖形驗證碼與顯示密碼按鈕", async () => {
    users.hasAnyUser.mockResolvedValue(true);

    const markup = await html();

    expect(markup).toMatch(/<img[^>]*alt="驗證碼圖片"[^>]*src="\/api\/auth\/captcha\?for=login&amp;t=\d+"|<img[^>]*src="\/api\/auth\/captcha\?for=login&amp;t=\d+"[^>]*alt="驗證碼圖片"/);
    expect(markup).toContain('name="captcha"');
    expect(markup).toContain("換一張");
    expect(markup.match(/aria-label="顯示密碼"/g)).toHaveLength(1);
  });

  it("有帳號_顯示帳號與密碼欄位", async () => {
    users.hasAnyUser.mockResolvedValue(true);

    const markup = await html();

    expect(markup).toContain('name="username"');
    expect(markup).toMatch(/autocomplete="username"/i);
    expect(markup).toContain('name="password"');
    expect(markup).not.toContain("npm run account create");
  });

  it("資料庫裡還沒有帳號_說明第一個帳號（站長）在電腦上建立，其他人用站長的邀請連結註冊", async () => {
    users.hasAnyUser.mockResolvedValue(false);

    expect(textOf(await html())).toContain("第一個帳號（站長）要在電腦上建立，之後的人用站長的邀請連結註冊");
  });

  it("查不到資料庫_照樣顯示登入表單（登入時再回錯誤）_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    users.hasAnyUser.mockRejectedValue(Object.assign(new Error("password authentication failed for db-secret"), { name: "PostgresError" }));

    const markup = await html();

    expect(markup).toContain('name="password"');
    expect(JSON.stringify(log.mock.calls)).not.toContain("db-secret");
  });
});

describe("登入頁的說明與連結", () => {
  it("頁尾連到使用聲明，並說明沒有帳號要向站長索取邀請連結", () => {
    const markup = renderToStaticMarkup(LoginFooter());

    expect(markup).toContain('href="/terms"');
    expect(textOf(markup)).toContain("還沒有帳號？請向站長索取邀請連結");
  });

  it("刪除帳號後導回來（?deleted=1）_顯示帳號已刪除；其他情況不顯示", async () => {
    const shown = renderToStaticMarkup((await DeletedNotice({ searchParams: Promise.resolve({ deleted: "1" }) })) as ReactElement);

    expect(textOf(shown)).toContain("帳號已刪除");
    expect(await DeletedNotice({ searchParams: Promise.resolve({}) })).toBeNull();
    expect(await DeletedNotice({ searchParams: Promise.resolve({ deleted: "yes" }) })).toBeNull();
  });
});
