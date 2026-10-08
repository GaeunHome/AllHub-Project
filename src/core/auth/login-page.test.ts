import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog } from "@/dev/test-helpers";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./actions", () => ({ login: vi.fn() }));
const users = vi.hoisted(() => ({ hasAnyUser: vi.fn() }));
vi.mock("./users", () => users);

const { LoginGate } = await import("./login-page");

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

  it("有帳號_顯示帳號與密碼欄位", async () => {
    users.hasAnyUser.mockResolvedValue(true);

    const markup = await html();

    expect(markup).toContain('name="username"');
    expect(markup).toMatch(/autocomplete="username"/i);
    expect(markup).toContain('name="password"');
    expect(markup).not.toContain("npm run account create");
  });

  it("查不到資料庫_照樣顯示登入表單（登入時再回錯誤）_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    users.hasAnyUser.mockRejectedValue(Object.assign(new Error("password authentication failed for db-secret"), { name: "PostgresError" }));

    const markup = await html();

    expect(markup).toContain('name="password"');
    expect(JSON.stringify(log.mock.calls)).not.toContain("db-secret");
  });
});
