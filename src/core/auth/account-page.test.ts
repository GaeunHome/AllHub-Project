import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";

vi.mock(".", () => ({ requireSession: vi.fn() }));
vi.mock("./actions", () => ({ logout: vi.fn(), changePasswordAction: vi.fn(), deleteAccountAction: vi.fn() }));

const session = mocksOf(await import("."), "requireSession");
const { AccountSections } = await import("./account-page");

const html = async () => renderToStaticMarkup((await AccountSections()) as ReactElement);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const ALICE = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice" };

beforeEach(() => {
  session.requireSession.mockReset().mockResolvedValue({ ...ALICE, role: "member" });
});

describe("帳號頁", () => {
  it("有刪除帳號的區塊：要輸入目前的密碼才能刪除", async () => {
    const markup = await html();

    expect(textOf(markup)).toContain("刪除帳號");
    expect(markup).toMatch(/<input[^>]*type="password"[^>]*name="password"|<input[^>]*name="password"[^>]*type="password"/);
    expect(textOf(markup)).toContain("刪除後無法復原");
  });

  it("一般成員_忘記密碼要請站長重設，不提命令列", async () => {
    const text = textOf(await html());

    expect(text).toContain("忘記密碼時請聯絡站長重設");
    expect(text).not.toContain("npm run account");
  });

  it("站長_顯示用命令列重設密碼的方法，並說明唯一的站長不能刪除自己", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, role: "owner" });

    const text = textOf(await html());

    expect(text).toContain("npm run account -- passwd alice");
    expect(text).toContain("唯一的站長不能刪除自己");
  });

  it("每個密碼欄位都可以切換顯示（改密碼三欄、刪除帳號一欄）", async () => {
    expect((await html()).match(/aria-label="顯示密碼"/g)).toHaveLength(4);
  });

  it("刪除帳號的說明：各功能的資料一起刪除，共用的翻譯留下但不再連到你", async () => {
    const text = textOf(await html());

    expect(text).toContain("刪除帳號時，追蹤名單、加密的 API Key 與 HoYoLAB cookie、記帳資料會一起刪除，共用的翻譯留下但不再連到你");
    expect(text).not.toContain("還沒有依帳號分開");
    expect(text).not.toContain("之後的版本");
  });

  it("連到使用聲明", async () => {
    expect(await html()).toContain('href="/terms"');
  });
});
