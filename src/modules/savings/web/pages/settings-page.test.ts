import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/savings/settings" }));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 卡片換成只記下收到什麼的替身 這裡只檢查設定頁讀了誰的資料與怎麼整理
vi.mock("../components/settings/categories-card", () => ({ CategoriesCard: vi.fn(() => null) }));
vi.mock("../components/forms/setup-button", () => ({
  SetupResultSlot: ({ children }: { children?: ReactNode }) => createElement("div", { "data-slot": "setup-result" }, children),
}));

const { redirect } = await import("next/navigation");
const cached = mocksOf(await import("../../service/cached"), "cachedCategories");
const { CategoriesCard } = await import("../components/settings/categories-card");
const dialog = await import("@/core/ui/dialog");
const { SettingsPage, CategoriesLoader, LegacyLinkRedirect } = await import("./settings-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: true };
const CREATED = new Date("2026-09-01T02:00:00Z");
const CATEGORIES = [
  { id: 11, userId: "u", kind: "expense", name: "餐飲", color: "orange", monthlyBudget: 6000, sortOrder: 1, createdAt: CREATED, icon: "utensils" },
  { id: 21, userId: "u", kind: "income", name: "薪水", color: "green", monthlyBudget: null, sortOrder: 2, createdAt: CREATED, icon: null },
];

const hrefs = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  vi.mocked(CategoriesCard).mockClear();
  vi.mocked(redirect).mockClear();
});

describe("理財的設定頁", () => {
  it("頁首（理財）與分頁列（設定是目前這一頁）", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings\/settings"|<a [^>]*href="\/savings\/settings"[^>]*aria-current="page"/);
  });

  it("帳戶與固定收支搬到自己的分頁：設定頁連過去（帳戶、投資、每月固定）", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));
    const below = markup.slice(markup.indexOf('data-slot="setup-result"'));

    expect(hrefs(below)).toEqual(expect.arrayContaining(["/savings/accounts", "/savings/investments", "/savings/recurring"]));
  });

  it("「開始使用」的成功訊息留在卡片外面（建好後卡片會換掉）", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(markup).toMatch(/<div data-slot="setup-result">[\s\S]*載入分類…/);
  });

  it("整頁的視窗共用一個訊息範圍：只留最新的一則成功訊息", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });
});

describe("分類", () => {
  it("用登入者（bob）的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    renderToStaticMarkup((await CategoriesLoader()) as ReactElement);

    expect(cached.cachedCategories).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("交給卡片的分類帶圖示，不帶 userId", async () => {
    renderToStaticMarkup((await CategoriesLoader()) as ReactElement);
    const { categories } = vi.mocked(CategoriesCard).mock.calls[0][0];

    expect(categories).toEqual([
      { id: 11, name: "餐飲", kind: "expense", color: "orange", monthlyBudget: 6000, icon: "utensils" },
      { id: 21, name: "薪水", kind: "income", color: "green", monthlyBudget: null, icon: null },
    ]);
  });
});

describe("舊網址（書籤、通知）轉到新的分頁", () => {
  const visit = (search: Record<string, string | string[] | undefined>) => LegacyLinkRedirect({ searchParams: Promise.resolve(search) });

  it("?add=account（新增帳戶）_轉到帳戶頁並打開新增銀行帳戶", async () => {
    await visit({ add: "account" });

    expect(redirect).toHaveBeenCalledWith("/savings/accounts?add=deposit");
  });

  it("?recurring=<id>（修改固定收支）_轉到每月固定頁的修改；是不是自己的由那一頁確認", async () => {
    await visit({ recurring: "33" });

    expect(redirect).toHaveBeenCalledWith("/savings/recurring?edit=33");
  });

  it.each([{}, { add: "purpose" }, { recurring: "abc" }, { recurring: ["33", "34"] }])("%j_不轉址，留在設定頁", async (search) => {
    await visit(search);

    expect(redirect).not.toHaveBeenCalled();
  });
});
