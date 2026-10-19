import { Suspense, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf, textOf } from "@/dev/test-helpers";

vi.mock(".", () => ({ requireSession: vi.fn() }));
vi.mock("./actions", () => ({ logout: vi.fn(), changePasswordAction: vi.fn(), deleteAccountAction: vi.fn() }));

const session = mocksOf(await import("."), "requireSession");
const { AccountPage, AccountSections } = await import("./account-page");

const html = async () => renderToStaticMarkup((await AccountSections()) as ReactElement);
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
});

/** 卡片是內容的 section 或骨架的 div.card */
const cardClasses = (markup: string) => [...markup.matchAll(/<(?:section|div)[^>]*class="([^"]*\bcard\b[^"]*)"/g)].map((m) => m[1].split(" "));

describe("帳號頁的版面（寬螢幕兩欄）", () => {
  it("載入中的骨架照同一套格線排：寬螢幕一樣是兩欄，載入完不會從一欄跳成兩欄", () => {
    const page = AccountPage() as ReactElement<{ className: string; children: ReactNode[] }>;
    const suspense = page.props.children.find((child) => isValidElement(child) && child.type === Suspense) as ReactElement<{ fallback: ReactNode }>;
    const markup = renderToStaticMarkup(suspense.props.fallback as ReactElement);

    expect(page.props.className.split(" ")).toEqual(expect.arrayContaining(["xl:grid", "xl:grid-cols-2"]));
    expect(markup.match(/^<div[^>]*class="([^"]*)"/)![1].split(" ")).toEqual(expect.arrayContaining(["xl:col-span-2", "xl:grid", "xl:grid-cols-2"]));
    const cards = cardClasses(markup);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toContain("xl:col-span-2");
    expect(cards[1]).toContain("xl:row-span-2");
  });
});

