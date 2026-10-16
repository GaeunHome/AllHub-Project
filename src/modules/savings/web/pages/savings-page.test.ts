import { readFileSync } from "node:fs";
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import type { SavingsAccount, SavingsCategory, SavingsHolding, SavingsPurpose, SavingsRecurring } from "../../data/schema";
import type { CardDailyFlow } from "../../lib/cards";
import type { AccountMonthFlow, CategoryMonthTotal } from "../../lib/ledger";
import type { Quote } from "../../lib/quotes";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 只看總覽把什麼交給表單 表單送出另外測
vi.mock("../actions", () =>
  Object.fromEntries(
    [
      "addTransactionAction",
      "updateTransactionAction",
      "updateBalanceAction",
      "allocateSalaryAction",
      "setupAction",
      "confirmOccurrenceAction",
      "skipOccurrenceAction",
      "payCardAction",
      "createHoldingAction",
      "updateHoldingAction",
      "deleteHoldingAction",
      "buyHoldingAction",
      "sellHoldingAction",
    ].map((name) => [name, vi.fn()]),
  ),
);

const cached = mocksOf(
  await import("../../service/cached"),
  "cachedAccounts",
  "cachedPurposes",
  "cachedCategories",
  "cachedAccountFlows",
  "cachedCategoryTotals",
  "cachedRecurring",
  "cachedHoldings",
  "cachedQuotes",
  "cachedCardFlows",
  "cachedCardBills",
);
const dialog = await import("@/core/ui/dialog");
const { SavingsPage, SavingsOverview } = await import("./savings-page");
const sections = await import("../components/dashboard/sections");

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
  account({ id: 1, name: "台銀", kind: "deposit", purposeId: 1, openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", purposeId: 2, openingBalance: 86000 }),
  account({ id: 4, name: "臺銀證券", kind: "investment", openingBalance: 100000, openingCost: 100000 }),
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, dueDay: 20, payFromAccountId: 2 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
];
const PURPOSES: SavingsPurpose[] = [
  { id: 1, userId: "u", name: "交割", color: "blue", sortOrder: 1, createdAt: CREATED },
  { id: 2, userId: "u", name: "生活費", color: "teal", sortOrder: 2, createdAt: CREATED },
];
const category = (id: number, name: string, kind: "income" | "expense", monthlyBudget: number | null = null): SavingsCategory => ({ id, userId: "u", kind, name, color: "blue", monthlyBudget, sortOrder: id, createdAt: CREATED });
const CATEGORIES = [category(1, "薪水", "income"), category(2, "餐飲", "expense", 6000), category(3, "交通", "expense")];
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
  cached.cachedPurposes.mockReset().mockResolvedValue(PURPOSES);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue(FLOWS);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue(TOTALS);
  cached.cachedRecurring.mockReset().mockResolvedValue(RULES);
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  cached.cachedQuotes.mockReset().mockResolvedValue(QUOTES);
  cached.cachedCardFlows.mockReset().mockResolvedValue(CARD_FLOWS);
  cached.cachedCardBills.mockReset().mockResolvedValue([]);
});

/** 頁首的按鈕加上每一區 跟整頁載入完的樣子一樣 */
const wholePage = async () =>
  (
    await Promise.all(
      [sections.OverviewQuickAdd(), sections.OverviewSalaryMenu(), sections.SummarySection(), sections.PendingSection(), sections.AccountsSection(), sections.ExpenseSection(), sections.TrendSection()].map(render),
    )
  ).join("");

describe("理財的總覽頁", () => {
  it("頁首是理財與分頁列（總覽是目前這一頁），頁首右邊的按鈕與下面的內容各自串流，先出現骨架", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO }));

    expect(markup).toMatch(/^<div data-accent="green" class="page-stack">/);
    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings"|<a [^>]*href="\/savings"[^>]*aria-current="page"/);
    expect(textOf(markup)).toContain("載入總覽…");
  });

  it("整頁的視窗共用一個訊息範圍：新的成功訊息出現時，其他視窗留下的舊訊息就收起來", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(SavingsPage, { info: INFO }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });

  it("由上而下：總資產、待處理、帳戶、本月支出、每月收支；待處理常常沒有，不先佔位置", async () => {
    const markup = await render(SavingsOverview());
    const order = ["載入總資產…", "載入帳戶…", "載入本月支出…", "載入每月收支…"].map((label) => markup.indexOf(label));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("每一區都用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await wholePage();
    await SavingsOverview();

    for (const fn of [cached.cachedAccounts, cached.cachedPurposes, cached.cachedCategories, cached.cachedAccountFlows, cached.cachedCategoryTotals, cached.cachedRecurring, cached.cachedHoldings]) {
      expect(fn.mock.calls.length).toBeGreaterThan(0);
      for (const call of fn.mock.calls) expect(call[0]).toBe(OTHER_SESSION.id);
    }
    for (const fn of [cached.cachedCardFlows, cached.cachedCardBills]) for (const call of fn.mock.calls) expect(call[0]).toBe(OTHER_SESSION.id);
  });

  describe("還沒有帳戶_歡迎卡取代整個總覽", () => {
    it("第一次使用（也還沒有用途與分類）：說明先建立常用的用途和分類，有「開始使用」與「新增帳戶」", async () => {
      cached.cachedAccounts.mockResolvedValue([]);
      cached.cachedPurposes.mockResolvedValue([]);
      cached.cachedCategories.mockResolvedValue([]);

      const markup = await render(SavingsOverview());

      expect(textOf(markup)).toContain("第一次使用？先建立常用的用途和分類（之後都能改），再新增帳戶。");
      expect(textOf(markup)).toContain("開始使用");
      expect(markup).toMatch(/<a [^>]*href="\/savings\/settings\?add=account#accounts"[^>]*>(?:(?!<\/a>).)*新增帳戶/);
      expect(markup).not.toContain("載入總資產…");
    });

    it("已經有用途或分類：一句話加上「新增帳戶」，頁首沒有記一筆與發薪分配", async () => {
      cached.cachedAccounts.mockResolvedValue([]);

      const markup = await render(SavingsOverview());
      const actions = (await Promise.all([sections.OverviewQuickAdd(), sections.OverviewSalaryMenu()].map(render))).join("");

      expect(textOf(markup)).toContain("還沒有帳戶");
      expect(markup).not.toContain("開始使用");
      expect(markup).toMatch(/<a [^>]*href="\/savings\/settings\?add=account#accounts"[^>]*>(?:(?!<\/a>).)*新增帳戶/);
      expect(actions).toBe("");
    });
  });
});

describe("介面原則", () => {
  it("一頁只有一個主要按鈕（頁首的記一筆），手機也用它，沒有右下角的浮動加號", async () => {
    const markup = await wholePage();

    expect(markup.match(/class="btn-primary[ "]/g)).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*class="btn-primary"[^>]*>(?:(?!<\/button>).)*記一筆<\/button>/);
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

describe("頁首的按鈕", () => {
  it("發薪分配收進記一筆旁邊的 ⋮ 選單，不再是一顆按鈕", async () => {
    const markup = await render(sections.OverviewSalaryMenu());

    expect(markup).toMatch(/<button[^>]*aria-label="更多記帳方式"[^>]*data-popup-trigger=""/);
    expect(textOf(markup)).not.toContain("發薪分配");
  });
});

describe("總資產與本月", () => {
  it("這個月花的比賺的多：寫「多花」多少，不寫負的存下", async () => {
    cached.cachedCategoryTotals.mockResolvedValue([total(1, "income", 3000), total(2, "expense", 12110)]);

    expect(textOf(await render(sections.SummarySection()))).toContain("多花 $9,110");
  });

  it("總資產是啟用中的存款加投資市值（有持股時用股數 × 收盤價）；本月一行寫收入、支出與存下", async () => {
    const text = textOf(await render(sections.SummarySection()));

    // 8,300 + (86,000 + 43,000 - 5,000) + 1,000 × 106.50 + 100 × 195.00 停用的與信用卡不算
    expect(text).toContain("總資產$258,300");
    expect(text).toContain("本月收入 $43,000·支出 $12,000·存下 $31,000");
  });

  it("沒有持股時不查股價；有持股時用排序去重的代號查", async () => {
    await render(sections.SummarySection());
    expect(cached.cachedQuotes).toHaveBeenCalledWith(["0050", "006208"]);

    cached.cachedQuotes.mockClear();
    cached.cachedHoldings.mockResolvedValue([]);
    await render(sections.SummarySection());
    expect(cached.cachedQuotes).not.toHaveBeenCalled();
  });

});

describe("待處理", () => {
  it("要確認的固定收支與信用卡帳單照日期排，同一天信用卡在前；自動記的不列；每列一顆按鈕（結帳後還沒填帳單的卡是「填帳單」）", async () => {
    const markup = await render(sections.PendingSection());
    const rows = [...markup.matchAll(/<li class="card-row[^"]*">(.*?)<\/li>/g)].map((m) => m[1]);
    const buttons = rows.map((row) => row.match(/aria-label="([^"]*)"[^>]*class="btn-secondary btn-sm[^"]*"/)?.[1]);

    expect(markup).toMatch(/<h2[^>]*>待處理<\/h2>/);
    expect(buttons).toEqual(["確認：006208 定期定額", "填帳單：國泰卡", "入帳並分配：薪水"]);
    expect(textOf(markup)).not.toContain("Netflix");
  });

  it("沒有要處理的就整區不出現", async () => {
    cached.cachedRecurring.mockResolvedValue([]);
    // 沒設截止日的卡不用填帳單也不用繳
    cached.cachedAccounts.mockResolvedValue(ACCOUNTS.map((item) => (item.kind === "credit" ? { ...item, dueDay: null } : item)));

    expect(await render(sections.PendingSection())).toBe("");
  });
});

describe("帳戶", () => {
  it("一張卡分成存款、投資、信用卡三組，組的標題寫小計；停用的帳戶不出現", async () => {
    const markup = await render(sections.AccountsSection());
    const groups = [...markup.matchAll(/<h3 id="fin-accounts-[a-z]+"[^>]*>(.*?)<\/h3>/g)].map((m) => textOf(m[1]));

    expect(groups).toEqual(["存款$132,300", "投資$126,000", "信用卡未繳 $19,480"]);
    expect(textOf(markup)).not.toContain("舊帳戶");
  });

  it("點一列打開帳戶詳情：每一列是打開視窗的按鈕，報讀器念出帳戶與金額", async () => {
    cached.cachedCardBills.mockResolvedValue([{ id: 1, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null }]);
    const markup = await render(sections.AccountsSection());
    const row = markup.match(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*國泰卡(?:(?!<\/button>).)*<\/button>/)![0];

    expect(textOf(row)).toBe("查看：國泰卡10/20 截止 · 本期應繳 $12,480$19,480");
  });
});

describe("本月支出", () => {
  it("分類照金額排；有預算的寫已用與預算，超支才寫超過多少；右上角連到全部紀錄", async () => {
    const markup = await render(sections.ExpenseSection());
    const rows = [...markup.matchAll(/<li><a [^>]*>(.*?)<\/a><\/li>/g)].map((m) => textOf(m[1]));

    expect(rows).toEqual(["餐飲超過 $500$6,500 / $6,000", "交通$5,500"]);
    expect(markup).toMatch(/<a [^>]*href="\/savings\/records"[^>]*>全部紀錄/);
  });
});
