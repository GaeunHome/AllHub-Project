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

// 固定在台北時間 2026-10-14 中午 下一期的日期才不會跟著跑測試的日子變
vi.useFakeTimers({ now: new Date("2026-10-14T04:00:00Z"), toFake: ["Date"] });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedPurposes", "cachedCategories", "cachedRecurring", "cachedAccountFlows", "cachedHoldings");
const cards = {
  accounts: vi.mocked((await import("../components/settings/accounts-card")).AccountsCard),
  purposes: vi.mocked((await import("../components/settings/purposes-card")).PurposesCard),
  categories: vi.mocked((await import("../components/settings/categories-card")).CategoriesCard),
  recurring: vi.mocked((await import("../components/settings/recurring-card")).RecurringCard),
};
const dialog = await import("@/core/ui/dialog");
const { SettingsPage, SetupNotice, AccountsLoader, PurposesLoader, CategoriesLoader, RecurringLoader } = await import("./settings-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: true };
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
  statementDay: null,
  payFromAccountId: null,
  autopay: false,
  cardNotifiedOn: null,
  active: true,
  sortOrder: id,
  createdAt: CREATED,
  ...fields,
});
const ACCOUNTS = [
  account(1, "生活費帳戶", { purposeId: 5, monthlyPlan: 5000 }),
  account(2, "郵局", { active: false }),
  account(3, "國泰卡", { kind: "credit", openingBalance: -3500, statementDay: 5, dueDay: 20, payFromAccountId: 1, autopay: true }),
  account(4, "臺銀證券", { kind: "investment" }),
  account(6, "舊證券", { kind: "investment", active: false }),
];
const PURPOSES = [
  { id: 5, userId: "u", name: "生活費", color: "blue", sortOrder: 1, createdAt: CREATED },
  { id: 6, userId: "u", name: "投資", color: "violet", sortOrder: 2, createdAt: CREATED },
];
const CATEGORIES = [
  { id: 11, userId: "u", kind: "expense", name: "餐飲", color: "orange", monthlyBudget: 6000, sortOrder: 1, createdAt: CREATED },
  { id: 21, userId: "u", kind: "income", name: "薪水", color: "green", monthlyBudget: null, sortOrder: 2, createdAt: CREATED },
];
const HOLDINGS = [
  { id: 50, userId: "u", accountId: 4, symbol: "006208", name: "富邦台灣50", shares: 120, cost: 12000, sortOrder: 0, createdAt: CREATED },
  { id: 51, userId: "u", accountId: 6, symbol: "0050", name: "元大台灣50", shares: 10, cost: 1500, sortOrder: 0, createdAt: CREATED },
];
const rule = (id: number, fields: Record<string, unknown>) => ({
  id,
  userId: "u",
  kind: "expense",
  name: null,
  accountId: 1,
  counterAccountId: null,
  categoryId: 11,
  amount: 15000,
  dayOfMonth: 6,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  mode: "confirm",
  holdingId: null,
  allocate: false,
  note: null,
  active: true,
  lastPostedMonth: "2026-10-01",
  lastNotifiedOn: null,
  createdAt: CREATED,
  ...fields,
});
// 10 月都處理過了 下一期都在 11 月
const RULES = [
  rule(30, { kind: "income", name: "薪水", categoryId: 21, amount: 52000, dayOfMonth: 10, holidayRule: "before", allocate: true }),
  rule(31, { name: "Netflix", amount: 390, dayOfMonth: 12, mode: "auto", accountId: 3 }),
  rule(32, { kind: "transfer", counterAccountId: 4, categoryId: null, holdingId: 50, amount: 3000, dayOfMonth: 5, holidayRule: "after" }),
  rule(33, { name: "電費", amount: 1200, dayOfMonth: 20, intervalMonths: 2, startMonth: "2026-09-01", lastPostedMonth: "2026-09-01" }),
  rule(34, { name: "健身房", active: false }),
  rule(35, { kind: "transfer", counterAccountId: 2, categoryId: null, note: "存到郵局" }),
];
const flow = (accountId: number, fields: Record<string, number>) => ({ accountId, month: "2026-09", income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...fields });
// 生活費帳戶有支出也轉出到郵局 郵局那邊是轉入 信用卡還沒有紀錄
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
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  for (const card of Object.values(cards)) card.mockClear();
});

describe("理財的設定頁", () => {
  it("頁首（理財）與分頁列（設定是目前這一頁）；四張卡片的錨點在串流完成前就在，從別頁連過來跳得到", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));

    expect(markup).toMatch(/^<div data-accent="green" class="page-stack">/);
    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings\/settings"|<a [^>]*href="\/savings\/settings"[^>]*aria-current="page"/);
    expect(textOf(markup)).toContain("載入帳戶…");
  });

  it("區段的順序：帳戶、固定收支、分類與預算，用途在最後", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage, { info: INFO }));
    const order = ["accounts", "recurring", "categories", "purposes"].map((id) => markup.indexOf(`id="${id}"`));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("寬螢幕排成兩欄，不靠第幾個子元素排", () => {
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
    ["固定收支", RecurringLoader, ["cachedRecurring", "cachedAccounts", "cachedCategories", "cachedHoldings"]],
  ] as const)("%s_用 bob 的 id 讀", async (_name, loader, reads) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await render(loader);

    for (const read of reads) expect(cached[read]).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("交給卡片的資料", () => {
  it("帳戶：用途與扣款帳戶的名稱、信用卡的結帳日與自動扣繳、刪除時會一起刪的固定收支數量（轉出或轉入是它的都算）、有沒有紀錄與轉帳", async () => {
    await render(AccountsLoader);
    const { accounts, purposes } = propsOf<{ accounts: Record<string, unknown>[]; purposes: unknown[] }>(cards.accounts);

    expect(accounts.map((item) => [item.name, item.purposeName, item.payFromName, item.recurringCount, item.hasRecords, item.hasTransfers])).toEqual([
      ["生活費帳戶", "生活費", null, 5, true, true],
      ["郵局", null, null, 1, true, true],
      ["國泰卡", null, "生活費帳戶", 1, false, false],
      ["臺銀證券", null, null, 1, false, false],
      ["舊證券", null, null, 0, false, false],
    ]);
    expect(accounts[2]).toMatchObject({ kind: "credit", openingBalance: -3500, statementDay: 5, dueDay: 20, autopay: true, active: true });
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

  it("固定收支：照下一期的日期排（含假日調整），停用的與帳戶停用的排在最後", async () => {
    await render(RecurringLoader);
    const { rules } = propsOf<{ rules: Record<string, unknown>[] }>(cards.recurring);

    // 11 月 5 日 10 日 12 日都是平日 每 2 個月的電費 9 月記過 下一期是 11 月 20 日
    expect(rules.map((item) => [item.id, item.nextDate, item.accountPaused])).toEqual([
      [32, "2026-11-05", false],
      [30, "2026-11-10", false],
      [31, "2026-11-12", false],
      [33, "2026-11-20", false],
      [34, null, false],
      [35, "2026-11-06", true],
    ]);
  });

  it("固定收支：有名稱的寫名稱，舊資料沒有名稱時照紀錄的寫法，定期定額寫哪一檔；排程文字寫間隔、假日與記帳方式", async () => {
    await render(RecurringLoader);
    const { rules } = propsOf<{ rules: Record<string, unknown>[] }>(cards.recurring);
    const byId = new Map(rules.map((item) => [item.id, item]));

    expect([30, 32, 33, 35].map((id) => byId.get(id)?.title)).toEqual(["薪水", "006208 定期定額", "電費", "生活費帳戶 → 郵局"]);
    expect(byId.get(30)?.schedule).toBe("每月 10 日 · 遇假日提前 · 到期請我確認");
    expect(byId.get(33)?.schedule).toBe("每 2 個月 20 日 · 到期請我確認");
    expect(byId.get(30)?.createdAt).toBe(CREATED.toISOString());
    expect(byId.get(30)).not.toHaveProperty("userId");
  });

  it.each([
    [{ recurring: "33" }, 33],
    [{}, null],
    [{ recurring: "999" }, null],
    [{ recurring: "abc" }, null],
    [{ recurring: ["33", "33"] }, null],
  ])("網址 %j（待處理的選單連過來）_自己打開哪一條的修改視窗：%s（別人的或不存在的不打開）", async (search, openId) => {
    await render(() => RecurringLoader({ searchParams: Promise.resolve(search) }));

    expect(propsOf<{ openId: number | null }>(cards.recurring).openId).toBe(openId);
  });

  it("定期定額的持股：投資帳戶裡的每一檔，帶帳戶名稱與帳戶是否還在用（停用的只在修改原本選它的規則時列出）", async () => {
    await render(RecurringLoader);
    const { holdings, accounts, today } = propsOf<{ holdings: unknown[]; accounts: unknown[]; today: string }>(cards.recurring);

    expect(holdings).toEqual([
      { id: 50, symbol: "006208", name: "富邦台灣50", accountId: 4, accountName: "臺銀證券", active: true },
      { id: 51, symbol: "0050", name: "元大台灣50", accountId: 6, accountName: "舊證券", active: false },
    ]);
    expect(accounts).toContainEqual({ id: 3, name: "國泰卡", kind: "credit", active: true, payFromAccountId: 1, withHoldings: false });
    // 有持股的投資帳戶不能一般轉帳 固定收支的轉帳選單不列它
    expect(accounts).toContainEqual(expect.objectContaining({ id: 4, withHoldings: true }));
    expect(today).toBe("2026-10-14");
  });
});
