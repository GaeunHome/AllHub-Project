import { describe, expect, it } from "vitest";
import type { CardDailyFlow } from "../lib/cards";
import type { ChecklistItem } from "../lib/checklist";
import type { HoldingLike } from "../lib/holdings";
import type { AccountMonthFlow, CategoryLike, CategoryMonthTotal } from "../lib/ledger";
import type { Quote } from "../lib/quotes";
import { accountsState, type AccountsInput, type OverviewAccount, type PendingEntry } from "./dashboard-view";
import { checklistRows, checklistSummary, heroView, monthView, quickActionsView } from "./overview-view";

const CREATED = new Date("2026-01-05T02:00:00Z");
const TODAY = "2026-10-15";

const account = (fixture: Pick<OverviewAccount, "id" | "name" | "kind"> & Partial<OverviewAccount>): OverviewAccount => ({
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
  ...fixture,
});

const ACCOUNTS = [
  account({ id: 1, name: "台銀", kind: "deposit", openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", openingBalance: 86000 }),
  account({ id: 4, name: "臺銀證券", kind: "investment", openingBalance: 100000, openingCost: 100000 }),
  account({ id: 5, name: "元大證券", kind: "investment", openingBalance: 50000, openingCost: 45000 }),
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, payFromAccountId: 2 }),
  account({ id: 7, name: "台新卡", kind: "credit", openingBalance: -3000, payFromAccountId: 2 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
  account({ id: 9, name: "舊證券", kind: "investment", openingBalance: 7000, active: false }),
  account({ id: 10, name: "停卡", kind: "credit", openingBalance: -800, active: false }),
];
const flow = (accountId: number, month: string, values: Partial<AccountMonthFlow>): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
const FLOWS = [flow(2, "2026-10", { income: 43000, expense: 5000 }), flow(6, "2026-09", { expense: 12480 }), flow(6, "2026-10", { expense: 7000 })];
const dayFlow = (date: string, expense: number): CardDailyFlow => ({ accountId: 6, date, income: 0, expense, transferIn: 0, transferOut: 0, adjust: 0 });
const holding = (id: number, symbol: string, shares: number, cost: number): HoldingLike => ({ id, accountId: 4, symbol, name: `${symbol} 名稱`, shares, cost, sortOrder: id });
const quote = (symbol: string, closeCents: number): Quote => ({ symbol, name: symbol, closeCents, date: "2026-10-14", market: "twse" });

const input = (overrides: Partial<AccountsInput> = {}): AccountsInput => ({
  accounts: ACCOUNTS,
  flows: FLOWS,
  holdings: [holding(1, "0050", 100, 18000), holding(2, "006208", 1000, 95000)],
  quotes: [quote("006208", 10650), quote("0050", 19500)],
  cardFlows: [dayFlow("2026-09-20", 12480), dayFlow("2026-10-10", 7000)],
  cardBills: [],
  today: TODAY,
  ...overrides,
});
const heroOf = (overrides: Partial<AccountsInput> = {}) => {
  const data = input(overrides);
  return heroView(data, accountsState(data));
};

describe("總資產大卡", () => {
  it("總資產與下面一行：存款、投資（有持股的照收盤價，加上損益與收盤日期）、信用卡未繳；停用的帳戶不算", () => {
    // 存款 8,300 + (86,000 + 43,000 - 5,000) 投資 1,000 × 106.50 + 100 × 195.00 + 50,000
    // 損益 (126,000 - 113,000) + (50,000 - 45,000) 國泰卡未繳 12,480 + 7,000 台新卡 3,000
    expect(heroOf()).toEqual({
      total: 308300,
      deposit: 132300,
      investment: { value: 176000, profit: 18000, priced: true, quoteDate: "2026-10-14" },
      cardOwed: 22480,
    });
  });

  it("股價讀不到：持股先用成本算，標成讀不到、沒有收盤日期", () => {
    // 投資 113,000 + 50,000 損益只剩沒有持股的 5,000
    expect(heroOf({ quotes: null })).toMatchObject({ total: 295300, investment: { value: 163000, profit: 5000, priced: false, quoteDate: null } });
  });

  it("沒有那一類帳戶就不寫那一段", () => {
    expect(heroOf({ accounts: ACCOUNTS.filter((item) => item.kind === "deposit"), holdings: [] })).toEqual({ total: 132300, deposit: 132300, investment: null, cardOwed: null });
  });
});

describe("我要…", () => {
  const view = (overrides: Partial<AccountsInput> = {}) => {
    const data = input(overrides);
    return quickActionsView(data, accountsState(data), [{ id: 11, name: "餐飲", kind: "expense" }], [{ holdingId: 2, accountId: 1 }]);
  };

  it("信用卡：只列啟用中的卡；打開的表單跟帳戶頁那張卡上的按鈕一樣，還沒填帳單的先填帳單（沒有結帳日的卡沒有待繳的帳單時也是）", () => {
    expect(view().cards.map(({ name, needsBill }) => ({ name, needsBill }))).toEqual([
      { name: "國泰卡", needsBill: true },
      { name: "台新卡", needsBill: true },
    ]);
    expect(view().cards[0].status).toBe("10/5 已結帳 · 待填帳單");
  });

  it("沒有結帳日的卡填了帳單還沒繳清：繳卡費", () => {
    const billed = view({ cardBills: [{ id: 2, accountId: 7, statementDate: "2026-10-12", dueDate: "2026-10-30", amount: 3000, paid: 0, lastPaidOn: null }] });

    expect(billed.cards.find((card) => card.name === "台新卡")?.needsBill).toBe(false);
  });

  it("國泰卡 10/5 的帳單填了以後就不用再填帳單", () => {
    const filled = view({ cardBills: [{ id: 1, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null }] });

    expect(filled.cards.find((card) => card.name === "國泰卡")?.needsBill).toBe(false);
  });

  it("買賣股票：每一檔持股都能選，日期不能早於證券帳戶開始記帳那天；定期定額的扣款帳戶是買賣的預設", () => {
    const { holdings } = view();

    expect(holdings.map((target) => [target.holding.symbol, target.accountName, target.minDate])).toEqual([
      ["006208", "臺銀證券", "2026-01-05"],
      ["0050", "臺銀證券", "2026-01-05"],
    ]);
    expect(holdings[0].holding.settlementAccountId).toBe(1);
  });

  it("更新餘額：信用卡照帳單繳、有持股的證券帳戶照股價算，都不能選；停用的也不列", () => {
    expect(view().balances.map((target) => target.name)).toEqual(["台銀", "生活費帳戶", "元大證券"]);
  });

  it("繳卡費與買賣的扣款帳戶只有啟用中的存款帳戶", () => {
    expect(view().depositAccounts.map((option) => option.name)).toEqual(["台銀", "生活費帳戶"]);
  });
});

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
const entry = (key: string, action: "bill" | "pay" | "confirm" | "allocate"): PendingEntry => ({ row: { key, action }, rule: null });

describe("這個月要做的事", () => {
  const ITEMS = [
    item({ key: "recurring:3:2026-10", title: "電費", date: "2026-10-20", state: "todo", amount: 1800, ruleId: 3 }),
    item({ key: "recurring:1:2026-10", title: "薪水", kind: "salary", date: "2026-10-10", state: "done", amount: 52000, doneOn: "2026-10-10", ruleId: 1 }),
    item({ key: "recurring:4:2026-11", title: "房租收入", date: "2026-11-03", state: "todo", upcoming: true, ruleId: 4 }),
    item({ key: "card:6:2026-10-05", title: "國泰卡", kind: "card", date: "2026-10-05", state: "todo", amount: 7000, estimated: true, cardId: 6, actionable: true, cardStage: "needs-bill" }),
    item({ key: "card:7:2026-10-25", title: "台新卡", kind: "card", date: "2026-10-25", state: "todo", amount: null, cardId: 7, cardStage: "unbilled" }),
    item({ key: "card:9:2026-09-15", title: "玉山卡", kind: "card", date: "2026-10-03", state: "done", amount: 2400, doneOn: "2026-10-01", cardId: 9, cardStage: "paid" }),
    item({ key: "recurring:5:2026-10", title: "Netflix", date: "2026-10-12", state: "auto-done", amount: 390, doneOn: "2026-10-12", ruleId: 5 }),
    item({ key: "recurring:3:2026-09", title: "電費", date: "2026-09-20", state: "overdue", carriedOver: true, ruleId: 3, actionable: true }),
    item({ key: "recurring:7:2026-10", title: "健身房", date: "2026-10-01", state: "skipped", ruleId: 7 }),
    item({ key: "recurring:8:2026-10", title: "手機費", date: "2026-10-28", state: "auto", amount: 599, ruleId: 8 }),
    item({ key: "recurring:9:2026-10", title: "保險", date: "2026-10-02", state: "done", doneOn: "2026-10-06", ruleId: 9 }),
  ];
  const ENTRIES = [entry("card:6:2026-10-05", "bill"), entry("recurring:3:2026-10", "confirm"), entry("recurring:3:2026-09", "confirm"), entry("recurring:1:2026-10", "allocate")];
  const rows = checklistRows({ items: ITEMS, entries: ENTRIES, today: TODAY }, new Set([4]));
  const rowOf = (key: string) => rows.find((row) => row.key === key)!;

  it("上個月沒做完的在最上面並標「上個月」，其他照日期，下個月初的在最後；信用卡寫結帳或截止", () => {
    expect(rows.map((row) => `${row.title} ${row.meta}`)).toEqual([
      "電費 上個月 · 9/20",
      "健身房 10/1 · 已略過",
      "保險 10/2 · 10/6 完成",
      "玉山卡 10/3 截止 · 10/1 繳清",
      "國泰卡 10/5 已結帳 · 待填帳單",
      "薪水 10/10 · 完成",
      "Netflix 10/12 · 已自動記帳",
      "電費 10/20 · 先處理前一期",
      "台新卡 10/25 結帳 · 結帳後填帳單",
      "手機費 10/28 · 自動記帳",
      "房租收入 11/3 · 還有 19 天",
    ]);
  });

  it("逾期的有「逾期 N 天」的標籤；收入加正號，還沒填帳單的金額是估計，還沒結帳的沒有金額", () => {
    expect(rowOf("recurring:3:2026-09").badge).toEqual({ label: "逾期 25 天", tone: "danger" });
    expect(rowOf("recurring:1:2026-10").amountText).toBe("+$52,000");
    expect(rowOf("recurring:4:2026-11").amountText).toBe("+$1,000");
    expect(rowOf("card:6:2026-10-05").amountText).toBe("約 $7,000");
    expect(rowOf("card:7:2026-10-25").amountText).toBe("");
  });

  it("只有現在就能處理的列接上視窗的內容（要先處理更早那一期的、做完的都沒有按鈕）", () => {
    expect(rows.filter((row) => row.entry !== null).map((row) => row.key)).toEqual(["recurring:3:2026-09", "card:6:2026-10-05"]);
  });

  it("還有幾件要做（含逾期、還沒結帳與下個月初的），最近一件是上個月沒做完的", () => {
    const summary = checklistSummary(ITEMS);

    expect(summary.remaining).toBe(5);
    expect(summary.next?.key).toBe("recurring:3:2026-09");
    expect(checklistSummary(ITEMS.filter((it) => it.state === "done"))).toEqual({ remaining: 0, next: null });
  });
});

describe("本月收支", () => {
  const category = (id: number, name: string, kind: "income" | "expense", icon: string | null, monthlyBudget: number | null = null): CategoryLike & { icon: string | null } => ({ id, name, kind, color: "blue", monthlyBudget, icon });
  const total = (categoryId: number | null, kind: "income" | "expense", amount: number, month = "2026-10"): CategoryMonthTotal => ({ categoryId, kind, month, amount });
  const CATEGORIES = [category(1, "薪水", "income", "briefcase"), category(2, "餐飲", "expense", "utensils", 6000), category(3, "交通", "expense", "bus")];

  it("收入、支出與存下（上個月的不算）；支出分類照金額排，每列帶分類的圖示", () => {
    const view = monthView(CATEGORIES, [total(1, "income", 43000), total(2, "expense", 6500), total(3, "expense", 5500), total(3, "expense", 900, "2026-09")], "2026-10");

    expect([view.income, view.expense, view.saved]).toEqual([43000, 12000, 31000]);
    expect(view.rows.map((row) => [row.name, row.spent, row.icon])).toEqual([
      ["餐飲", 6500, "utensils"],
      ["交通", 5500, "bus"],
    ]);
  });
});
