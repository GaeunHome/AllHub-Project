import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 卡片換成只記下收到什麼的替身 這裡只檢查設定頁讀了誰的資料與怎麼整理
vi.mock("../components/settings/accounts-card", () => ({ AccountsCard: vi.fn(() => null) }));
vi.mock("../components/settings/purposes-card", () => ({ PurposesCard: vi.fn(() => null) }));
vi.mock("../components/settings/categories-card", () => ({ CategoriesCard: vi.fn(() => null) }));
vi.mock("../components/settings/recurring-card", () => ({ RecurringCard: vi.fn(() => null) }));
vi.mock("../components/forms/setup-button", () => ({
  SetupButton: () => createElement("button", { "data-form": "setup" }, "開始使用"),
  SetupResultSlot: ({ children }: { children?: ReactNode }) => createElement("div", { "data-slot": "setup-result" }, children),
}));

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedPurposes", "cachedCategories", "cachedRecurring", "cachedAccountFlows");
const cards = {
  accounts: vi.mocked((await import("../components/settings/accounts-card")).AccountsCard),
  purposes: vi.mocked((await import("../components/settings/purposes-card")).PurposesCard),
  categories: vi.mocked((await import("../components/settings/categories-card")).CategoriesCard),
  recurring: vi.mocked((await import("../components/settings/recurring-card")).RecurringCard),
};
const dialog = await import("@/core/ui/dialog");
const { SettingsPage, SetupNotice, AccountsLoader, PurposesLoader, CategoriesLoader, RecurringLoader } = await import("./settings-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: false };
const CREATED = new Date("2026-09-01T02:00:00Z");
const account = (id: number, name: string, fields: Record<string, unknown> = {}) => ({
  id,
  userId: "u",
  name,
  kind: "deposit",
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: id,
  createdAt: CREATED,
  ...fields,
});
const ACCOUNTS = [
  account(1, "國泰", { purposeId: 5, monthlyPlan: 5000 }),
  account(2, "郵局", { active: false }),
  account(3, "國泰信用卡", { kind: "credit", openingBalance: -3500, dueDay: 6, payFromAccountId: 1 }),
];
const PURPOSES = [
  { id: 5, userId: "u", name: "生活費", color: "blue", sortOrder: 1, createdAt: CREATED },
  { id: 6, userId: "u", name: "投資", color: "violet", sortOrder: 2, createdAt: CREATED },
];
const CATEGORIES = [{ id: 11, userId: "u", kind: "expense", name: "餐飲", color: "orange", monthlyBudget: 6000, sortOrder: 1, createdAt: CREATED }];
const rule = (id: number, fields: Record<string, unknown>) => ({
  id,
  userId: "u",
  kind: "expense",
  accountId: 1,
  counterAccountId: null,
  categoryId: 11,
  amount: 15000,
  dayOfMonth: 6,
  note: null,
  active: true,
  lastPostedMonth: null,
  createdAt: CREATED,
  ...fields,
});
const RULES = [rule(30, {}), rule(31, { kind: "transfer", counterAccountId: 2, categoryId: null }), rule(32, { active: false })];
const flow = (accountId: number, fields: Record<string, number>) => ({ accountId, month: "2026-09", income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...fields });
// 國泰有支出也轉出到郵局 郵局那邊是轉入 信用卡還沒有紀錄
const FLOWS = [flow(1, { expense: 120 }), flow(1, { transferOut: 5000 }), flow(2, { transferIn: 5000 })];

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const propsOf = <T>(card: { mock: { calls: unknown[][] } }) => card.mock.calls[0][0] as T;
const render = async (loader: () => Promise<unknown>) => renderToStaticMarkup((await loader()) as ReactElement);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedPurposes.mockReset().mockResolvedValue(PURPOSES);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedRecurring.mockReset().mockResolvedValue(RULES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue(FLOWS);
  for (const card of Object.values(cards)) card.mockClear();
});

describe("理財的設定頁", () => {
  it("頁首（理財）與分頁列（設定是目前這一頁）；四張卡片的錨點在串流完成前就在，從別頁連過來跳得到", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(markup).toMatch(/^<div data-accent="green" class="page-stack">/);
    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings\/settings"|<a [^>]*href="\/savings\/settings"[^>]*aria-current="page"/);
    for (const id of ["accounts", "purposes", "categories", "recurring"]) expect(markup).toContain(`id="${id}"`);
    expect(textOf(markup)).toContain("載入帳戶…");
  });

  it("寬螢幕排成兩欄（帳戶與用途一欄、分類與固定收支一欄），不靠第幾個子元素排", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(markup).toContain('class="page-stack xl:grid xl:grid-cols-2 xl:items-start"');
    expect(markup).not.toMatch(/nth-|\[&>|\*:/);
  });

  it("整頁的視窗共用一個訊息範圍：只留最新的一則成功訊息", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });
});

describe("開始使用", () => {
  it("還沒有任何用途與分類_最上面說明並放「開始使用」", async () => {
    cached.cachedPurposes.mockResolvedValue([]);
    cached.cachedCategories.mockResolvedValue([]);

    const markup = await render(SetupNotice);

    expect(textOf(markup)).toContain("先建立常用的用途和分類（之後都能改），再新增帳戶。");
    expect(markup).toContain('data-form="setup"');
  });

  it("已經有用途或分類_不顯示卡片；留著外面的位置（剛按完「開始使用」卡片被換掉時，成功訊息放在這裡）", async () => {
    expect(await render(SetupNotice)).toBe('<div data-slot="setup-result"></div>');

    cached.cachedPurposes.mockResolvedValue([]);
    expect(await render(SetupNotice)).toBe('<div data-slot="setup-result"></div>');
  });

  it("要顯示時卡片也包在同一個位置裡（建好後換掉的只有卡片，位置與訊息留著）", async () => {
    cached.cachedPurposes.mockResolvedValue([]);
    cached.cachedCategories.mockResolvedValue([]);

    expect(await render(SetupNotice)).toMatch(/^<div data-slot="setup-result"><section[^>]*aria-labelledby="savings-setup"/);
  });
});

describe("每張卡片讀登入者自己的資料", () => {
  it.each([
    ["帳戶", AccountsLoader, ["cachedAccounts", "cachedPurposes", "cachedRecurring", "cachedAccountFlows"]],
    ["用途", PurposesLoader, ["cachedPurposes", "cachedAccounts"]],
    ["分類", CategoriesLoader, ["cachedCategories"]],
    ["固定收支", RecurringLoader, ["cachedRecurring", "cachedAccounts", "cachedCategories"]],
  ] as const)("%s_用 bob 的 id 讀", async (_name, loader, reads) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await render(loader);

    for (const read of reads) expect(cached[read]).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("交給卡片的資料", () => {
  it("帳戶：用途的名稱與顏色、扣款帳戶的名稱、刪除時會一起刪的固定收支數量（轉出或轉入是它的都算）、有沒有紀錄與轉帳", async () => {
    await render(AccountsLoader);
    const { accounts, purposes } = propsOf<{ accounts: Record<string, unknown>[]; purposes: unknown[] }>(cards.accounts);

    expect(accounts.map((item) => [item.name, item.purposeName, item.purposeColor, item.payFromName, item.recurringCount, item.hasRecords, item.hasTransfers])).toEqual([
      ["國泰", "生活費", "blue", null, 3, true, true],
      ["郵局", null, null, null, 1, true, true],
      ["國泰信用卡", null, null, "國泰", 0, false, false],
    ]);
    expect(accounts[2]).toMatchObject({ kind: "credit", openingBalance: -3500, dueDay: 6, active: true });
    expect(accounts[0]).not.toHaveProperty("userId");
    expect(purposes).toEqual([
      { id: 5, name: "生活費" },
      { id: 6, name: "投資" },
    ]);
  });

  it("只有收支、沒有轉帳的帳戶_有紀錄但沒有轉帳", async () => {
    cached.cachedAccountFlows.mockResolvedValue([flow(1, { expense: 120, income: 500 })]);

    await render(AccountsLoader);

    expect(propsOf<{ accounts: Record<string, unknown>[] }>(cards.accounts).accounts[0]).toMatchObject({ hasRecords: true, hasTransfers: false });
  });

  it.each([
    [{ add: "account" }, true],
    [{}, false],
    [{ add: "purpose" }, false],
    [{ add: ["account", "account"] }, false],
  ])("網址 %j_新增帳戶的視窗要不要自己打開：%s", async (search, openAdd) => {
    await render(() => AccountsLoader({ searchParams: Promise.resolve(search) }));

    expect(propsOf<{ openAdd: boolean }>(cards.accounts).openAdd).toBe(openAdd);
  });

  it("用途：用了它的帳戶數", async () => {
    await render(PurposesLoader);

    expect(propsOf<{ purposes: unknown[] }>(cards.purposes).purposes).toEqual([
      { id: 5, name: "生活費", color: "blue", accountCount: 1 },
      { id: 6, name: "投資", color: "violet", accountCount: 0 },
    ]);
  });

  it("固定收支：名稱 join 好；啟用中的寫出下次日期，停用的沒有；帳戶（或轉入的帳戶）停用了標出來", async () => {
    await render(RecurringLoader);
    const { rules, accounts, today } = propsOf<{ rules: Record<string, unknown>[]; accounts: unknown[]; today: string }>(cards.recurring);

    expect(rules.map((item) => [item.id, item.accountName, item.counterAccountName, item.categoryName, item.accountPaused])).toEqual([
      [30, "國泰", null, "餐飲", false],
      [31, "國泰", "郵局", null, true],
      [32, "國泰", null, "餐飲", false],
    ]);
    expect(rules[0].nextDate).toMatch(/^\d{4}-\d{2}-06$/);
    expect(rules[2].nextDate).toBeNull();
    expect(rules[0].createdAt).toBe(CREATED.toISOString());
    expect(accounts).toEqual([
      { id: 1, name: "國泰", kind: "deposit", active: true, payFromAccountId: null },
      { id: 2, name: "郵局", kind: "deposit", active: false, payFromAccountId: null },
      { id: 3, name: "國泰信用卡", kind: "credit", active: true, payFromAccountId: 1 },
    ]);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
