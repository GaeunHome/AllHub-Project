import { readFileSync } from "node:fs";
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import type { SavingsAccount, SavingsCategory, SavingsHolding, SavingsRecurring } from "../../data/schema";
import type { CardDailyFlow } from "../../lib/cards";
import type { ChecklistItem } from "../../lib/checklist";
import type { AccountMonthFlow, CategoryMonthTotal } from "../../lib/ledger";
import type { Quote } from "../../lib/quotes";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/savings" }));
vi.mock("../../service/cached", { spy: true });
vi.mock("../overview-data", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 只看總覽把什麼交給表單 表單送出另外測
vi.mock("../actions", () =>
  Object.fromEntries(
    [
      "addTransactionAction",
      "allocateSalaryAction",
      "buyHoldingAction",
      "confirmOccurrenceAction",
      "createHoldingAction",
      "enterCardBillAction",
      "payCardAction",
      "sellHoldingAction",
      "setupAction",
      "skipOccurrenceAction",
      "updateBalanceAction",
      "updateHoldingAction",
    ].map((name) => [name, vi.fn()]),
  ),
);

const cached = mocksOf(
  await import("../../service/cached"),
  "cachedAccounts",
  "cachedCategories",
  "cachedAccountFlows",
  "cachedCategoryTotals",
  "cachedRecurring",
  "cachedHoldings",
  "cachedQuotes",
  "cachedCardFlows",
  "cachedCardBills",
  "cachedRecurringRecords",
);
const overviewData = mocksOf(await import("../overview-data"), "loadAccounts", "loadChecklist");
const dialog = await import("@/core/ui/dialog");
const { SavingsPage, SavingsOverview } = await import("./savings-page");
const sections = await import("../components/overview/sections");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: true };
// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-01-05T02:00:00Z");

const globalsCss = readFileSync(new URL("../../../../app/globals.css", import.meta.url), "utf8");
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const render = async (node: Promise<ReactNode> | ReactNode) => renderToStaticMarkup(createElement(Fragment, null, (await node) as ReactElement));

const account = (fixture: Pick<SavingsAccount, "id" | "name" | "kind"> & Partial<SavingsAccount>): SavingsAccount => ({
  userId: "u",
  purposeId: null,
  label: null,
  cardStyle: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: fixture.id,
  createdAt: CREATED,
  statementDay: null,
  autopay: false,
  cardNotifiedOn: null,
  ...fixture,
});
const ACCOUNTS = [
  account({ id: 1, name: "台銀", kind: "deposit", label: "交割", openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", openingBalance: 86000 }),
  account({ id: 4, name: "臺銀證券", kind: "investment", openingBalance: 100000, openingCost: 100000 }),
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, payFromAccountId: 2 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
];
const category = (id: number, name: string, kind: "income" | "expense", monthlyBudget: number | null = null, icon: string | null = null): SavingsCategory => ({
  id,
  userId: "u",
  kind,
  name,
  color: "blue",
  monthlyBudget,
  sortOrder: id,
  createdAt: CREATED,
  icon,
});
const CATEGORIES = [category(1, "薪水", "income", null, "briefcase"), category(2, "餐飲", "expense", 6000, "utensils"), category(3, "交通", "expense", null, "bus")];
const flow = (accountId: number, month: string, values: Partial<AccountMonthFlow>): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
const FLOWS = [flow(2, "2026-10", { income: 43000, expense: 5000 }), flow(6, "2026-09", { expense: 12480 }), flow(6, "2026-10", { expense: 7000 })];
const total = (categoryId: number | null, kind: "income" | "expense", amount: number): CategoryMonthTotal => ({ categoryId, kind, month: "2026-10", amount });
const TOTALS = [total(1, "income", 43000), total(2, "expense", 6500), total(3, "expense", 5500)];
const dayFlow = (date: string, expense: number): CardDailyFlow => ({ accountId: 6, date, income: 0, expense, transferIn: 0, transferOut: 0, adjust: 0 });
const CARD_FLOWS = [dayFlow("2026-09-20", 12480), dayFlow("2026-10-10", 7000)];
const holding = (id: number, symbol: string, shares: number, cost: number): SavingsHolding => ({ id, userId: "u", accountId: 4, symbol, name: `${symbol} 名稱`, shares, cost, sortOrder: id, createdAt: CREATED });
const HOLDINGS = [holding(1, "006208", 1000, 95000), holding(2, "0050", 100, 18000)];
const quote = (symbol: string, closeCents: number): Quote => ({ symbol, name: symbol, closeCents, date: "2026-10-14", market: "twse" });
const QUOTES = [quote("006208", 10650), quote("0050", 19500)];
const rule = (fixture: Pick<SavingsRecurring, "id" | "kind" | "amount" | "accountId" | "dayOfMonth"> & Partial<SavingsRecurring>): SavingsRecurring => ({
  userId: "u",
  counterAccountId: null,
  categoryId: null,
  note: null,
  active: true,
  lastPostedMonth: "2026-09-01",
  createdAt: CREATED,
  name: null,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  mode: "confirm",
  holdingId: null,
  allocate: false,
  lastNotifiedOn: null,
  ...fixture,
});
const RULES = [
  rule({ id: 1, name: "薪水", kind: "income", amount: 52000, accountId: 2, categoryId: 1, dayOfMonth: 20, allocate: true }),
  rule({ id: 2, kind: "transfer", amount: 5000, accountId: 1, counterAccountId: 4, holdingId: 1, dayOfMonth: 15 }),
  rule({ id: 3, name: "Netflix", kind: "expense", amount: 390, accountId: 6, dayOfMonth: 12, mode: "auto" }),
];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue(FLOWS);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue(TOTALS);
  cached.cachedRecurring.mockReset().mockResolvedValue(RULES);
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  cached.cachedQuotes.mockReset().mockResolvedValue(QUOTES);
  cached.cachedCardFlows.mockReset().mockResolvedValue(CARD_FLOWS);
  cached.cachedCardBills.mockReset().mockResolvedValue([]);
  cached.cachedRecurringRecords.mockReset().mockResolvedValue([]);
  overviewData.loadAccounts.mockReset();
  overviewData.loadChecklist.mockReset();
});

/** 每一區載入完的樣子 */
const wholePage = async () =>
  (await Promise.all([sections.HeroSection(), sections.QuickActionsSection(), sections.ChecklistSection(), sections.MonthSection(), sections.TrendSection()].map(render))).join("") +
  (await render(SavingsOverview()));

describe("理財的總覽頁", () => {
  it("頁首是理財，分頁列照順序是總覽、紀錄、帳戶、投資、每月固定、設定，總覽是目前這一頁", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO }));
    const tabs = [...markup.slice(markup.indexOf('aria-label="理財的頁面"')).matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((m) => [m[0].match(/href="([^"]*)"/)?.[1], textOf(m[1]), m[0].includes('aria-current="page"')]);

    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(tabs).toEqual([
      ["/savings", "總覽", true],
      ["/savings/records", "紀錄", false],
      ["/savings/accounts", "帳戶", false],
      ["/savings/investments", "投資", false],
      ["/savings/recurring", "每月固定", false],
      ["/savings/settings", "設定", false],
    ]);
    expect(textOf(markup)).toContain("載入總覽…");
  });

  it("整頁的視窗共用一個訊息範圍：新的成功訊息出現時，其他視窗留下的舊訊息就收起來", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(SavingsPage, { info: INFO }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });

  it("由上而下：開始設定、總資產、我要…、這個月要做的事、本月收支、每月收支、怎麼用", async () => {
    // 還沒設定每月固定支出 開始設定才會出現
    cached.cachedRecurring.mockResolvedValue(RULES.filter((item) => item.name !== "Netflix"));

    const markup = await render(SavingsOverview());
    const order = ["開始設定", "載入總資產…", "載入常用的動作…", "載入這個月要做的事…", "載入本月收支…", "載入每月收支…", "花錢可以隨手記一筆"].map((label) => markup.indexOf(label));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("每一區都用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await wholePage();

    for (const fn of [cached.cachedAccounts, cached.cachedCategories, cached.cachedAccountFlows, cached.cachedCategoryTotals, cached.cachedRecurring, cached.cachedHoldings, cached.cachedCardFlows, cached.cachedCardBills, cached.cachedRecurringRecords]) {
      expect(fn.mock.calls.length).toBeGreaterThan(0);
      for (const call of fn.mock.calls) expect(call[0]).toBe(OTHER_SESSION.id);
    }
    for (const fn of [overviewData.loadAccounts, overviewData.loadChecklist]) for (const call of fn.mock.calls) expect(call[0]).toBe(OTHER_SESSION.id);
  });
});

describe("開始設定", () => {
  it("還沒有帳戶：整個總覽只有開始設定，五步都連到新增的視窗；也還沒有分類時上面先有「開始使用」", async () => {
    cached.cachedAccounts.mockResolvedValue([]);
    cached.cachedCategories.mockResolvedValue([]);
    cached.cachedRecurring.mockResolvedValue([]);

    const markup = await render(SavingsOverview());

    expect(textOf(markup)).toContain("已完成 0/5");
    expect(textOf(markup)).toContain("開始使用");
    expect(markup).not.toContain("載入總資產…");
    expect(markup).not.toContain("載入這個月要做的事…");
  });

  it("五步都做完：不再出現", async () => {
    cached.cachedAccounts.mockResolvedValue([...ACCOUNTS, account({ id: 9, name: "國泰證券", kind: "investment" })]);
    cached.cachedRecurring.mockResolvedValue([...RULES, rule({ id: 4, name: "房租", kind: "expense", amount: 15000, accountId: 2, dayOfMonth: 5 })]);

    expect(await render(SavingsOverview())).not.toContain("開始設定");
  });
});

describe("總資產", () => {
  it("總資產是啟用中的存款加投資市值（有持股時用股數 × 收盤價）；下面一行寫存款、投資與損益、收盤日期、信用卡未繳", async () => {
    const text = textOf(await render(sections.HeroSection()));

    // 8,300 + (86,000 + 43,000 - 5,000) + 1,000 × 106.50 + 100 × 195.00 停用的與信用卡不算
    expect(text).toContain("總資產$258,300");
    // 損益 126,000 - 113,000 國泰卡 12,480 + 7,000
    expect(text).toContain("存款 $132,300·投資 $126,000（損益 +$13,000，10/14 收盤）·信用卡未繳 $19,480");
  });

  it("沒有持股時不查股價；有持股時用排序去重的代號查", async () => {
    await render(sections.HeroSection());
    expect(cached.cachedQuotes).toHaveBeenCalledWith(["0050", "006208"]);

    cached.cachedQuotes.mockClear();
    cached.cachedHoldings.mockResolvedValue([]);
    await render(sections.HeroSection());
    expect(cached.cachedQuotes).not.toHaveBeenCalled();
  });
});

describe("這個月要做的事", () => {
  it("沒有任何固定收支與信用卡：一句說明加上「設定薪水與每月固定」（連到每月固定頁）", async () => {
    cached.cachedRecurring.mockResolvedValue([]);
    cached.cachedAccounts.mockResolvedValue(ACCOUNTS.filter((item) => item.kind !== "credit"));

    const markup = await render(sections.ChecklistSection());

    expect(markup).toMatch(/<a [^>]*href="\/savings\/recurring"[^>]*>(?:(?!<\/a>).)*設定薪水與每月固定/);
  });

  it("照 loadChecklist 的資料一列一件，要處理的接上待處理的視窗；標題列寫還有幾件", async () => {
    const item = (fixture: Pick<ChecklistItem, "key" | "title" | "date" | "state"> & Partial<ChecklistItem>): ChecklistItem => ({
      kind: "recurring",
      amount: 1000,
      estimated: false,
      doneOn: null,
      carriedOver: false,
      upcoming: false,
      ruleId: null,
      period: null,
      cardId: null,
      actionable: false,
      cardStage: null,
      ...fixture,
    });
    const view = await overviewData.loadChecklist(OTHER_SESSION.id, NOW);
    overviewData.loadChecklist.mockResolvedValue({
      ...view,
      items: [
        item({ key: "card:6:2026-10-05", title: "國泰卡", kind: "card", date: "2026-10-05", state: "todo", amount: 19480, estimated: true, cardId: 6, actionable: true, cardStage: "needs-bill" }),
        item({ key: "recurring:3:2026-10", title: "Netflix", date: "2026-10-12", state: "auto-done", amount: 390, doneOn: "2026-10-12", ruleId: 3 }),
      ],
    });

    const markup = await render(sections.ChecklistSection());

    expect(textOf(markup)).toContain("還有 1 件");
    expect(markup).toMatch(/aria-label="填帳單：國泰卡"/);
    expect(textOf(markup)).toContain("Netflix");
  });
});

describe("本月收支", () => {
  it("一行寫收入、支出與存下；支出分類照金額排，有預算的寫已用與預算，點一列到紀錄頁篩好那個分類", async () => {
    const markup = await render(sections.MonthSection());
    const rows = [...markup.matchAll(/<li><a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a><\/li>/g)].map((m) => [m[1], textOf(m[2])]);

    expect(textOf(markup)).toContain("收入 +$43,000·支出 $12,000·存下 $31,000");
    expect(rows).toEqual([
      ["/savings/records?category=2", "餐飲超過 $500$6,500 / $6,000"],
      ["/savings/records?category=3", "交通$5,500"],
    ]);
  });

  it("這個月花的比賺的多：寫「多花」多少，不寫負的存下", async () => {
    cached.cachedCategoryTotals.mockResolvedValue([total(1, "income", 3000), total(2, "expense", 12110)]);

    expect(textOf(await render(sections.MonthSection()))).toContain("多花 $9,110");
  });
});

describe("介面原則", () => {
  it("主要按鈕最多一個（開始設定的下一步），沒有右下角的浮動加號", async () => {
    const markup = await wholePage();

    expect(markup.match(/class="btn-primary[ "]/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(markup).not.toMatch(/fixed right-4/);
  });

  it("數字一出現就是最後的值：沒有從 0 往上數與進場動畫", async () => {
    expect(await wholePage()).not.toMatch(/fin-count|fin-rise|--i:/);
    expect(globalsCss).not.toMatch(/@keyframes fin-|\.fin-rise|\.fin-count/);
  });

  it("卡片標題不帶圖示，標題旁沒有裝飾用的圖示方塊", async () => {
    expect(await wholePage()).not.toContain("icon-tile");
  });
});
