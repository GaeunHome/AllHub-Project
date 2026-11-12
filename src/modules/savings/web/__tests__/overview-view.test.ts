import { describe, expect, it } from "vitest";
import { accountRow, checklistItem as item, dayFlowRow, flowRow as flow } from "../../dev/fixtures";
import type { HoldingLike } from "../../lib/holdings";
import type { CategoryLike, CategoryMonthTotal } from "../../lib/ledger";
import type { Quote } from "../../lib/quotes";
import { accountsState, type AccountsInput, type OverviewAccount } from "../accounts-state";
import { checklistRows, checklistSummary, heroView, monthView, quickActionsView, urgentRows, type ChecklistRow } from "../overview-view";
import type { PendingEntry } from "../pending-view";

const CREATED = new Date("2026-01-05T02:00:00Z");
const TODAY = "2026-10-15";

const account = (fixture: Pick<OverviewAccount, "id" | "name" | "kind"> & Partial<OverviewAccount>): OverviewAccount => accountRow({ createdAt: CREATED, ...fixture });

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
const FLOWS = [flow(2, "2026-10", { income: 43000, expense: 5000 }), flow(6, "2026-09", { expense: 12480 }), flow(6, "2026-10", { expense: 7000 })];
const holding = (id: number, symbol: string, shares: number, cost: number): HoldingLike => ({ id, accountId: 4, symbol, name: `${symbol} 名稱`, shares, cost, sortOrder: id });
const quote = (symbol: string, closeCents: number): Quote => ({ symbol, name: symbol, closeCents, date: "2026-10-14", market: "twse" });

const input = (overrides: Partial<AccountsInput> = {}): AccountsInput => ({
  accounts: ACCOUNTS,
  flows: FLOWS,
  holdings: [holding(1, "0050", 100, 18000), holding(2, "006208", 1000, 95000)],
  quotes: [quote("006208", 10650), quote("0050", 19500)],
  cardFlows: [dayFlowRow(6, "2026-09-20", { expense: 12480 }), dayFlowRow(6, "2026-10-10", { expense: 7000 })],
  cardBills: [],
  today: TODAY,
  ...overrides,
});
const heroOf = (overrides: Partial<AccountsInput> = {}) => {
  const data = input(overrides);
  return heroView(data, accountsState(data));
};

describe("總資產大卡（合計的算法在 lib/ledger 的 assetSummary）", () => {
  it("有持股的寫收盤日期；股價讀不到時標成讀不到、沒有收盤日期", () => {
    expect(heroOf().investment).toMatchObject({ priced: true, quoteDate: "2026-10-14" });
    expect(heroOf({ quotes: null }).investment).toMatchObject({ priced: false, quoteDate: null });
  });

  // 使用者要的 未繳只算帳單 未出帳不加進來
  it("信用卡未繳只算帳單：國泰卡 10/5 結帳的 12,480（還沒填帳單照紀錄估）算，10/10 刷的 7,000 與台新卡從沒結帳的 3,000 不算，停用的卡也不算", () => {
    expect(heroOf().cardOwed).toBe(12_480);
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

  it("信用卡：只列啟用中的卡；選卡時每張寫帳戶頁那張卡的狀態", () => {
    expect(view().cards.map(({ name }) => name)).toEqual(["國泰卡", "台新卡"]);
    // 10/10 刷的 7,000 在 10/5 結帳之後
    expect(view().cards[0].status).toEqual(["結帳日 10/5", "未出帳 $7,000", "待填帳單"]);
  });

  it("沒有結帳日的卡填了帳單還沒繳清：寫本期應繳，不再是待填帳單", () => {
    const billed = view({ cardBills: [{ id: 2, accountId: 7, statementDate: "2026-10-12", dueDate: "2026-10-30", amount: 3000, paid: 0, lastPaidOn: null }] });
    const status = billed.cards.find((card) => card.name === "台新卡")?.status;

    expect(status).toContain("本期應繳 $3,000");
    expect(status).not.toContain("待填帳單");
  });

  it("國泰卡 10/5 的帳單填了以後就不用再填帳單：寫本期應繳", () => {
    const filled = view({ cardBills: [{ id: 1, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null }] });
    const status = filled.cards.find((card) => card.name === "國泰卡")?.status;

    expect(status).toContain("本期應繳 $12,480");
    expect(status).not.toContain("待填帳單");
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

const entry = (key: string, action: "bill" | "pay" | "confirm" | "allocate"): PendingEntry => ({ row: { key, action }, rule: null });

describe("這個月要做的事", () => {
  // 照 monthChecklist 排好的順序 上個月沒做完的在最上面 其他照日期
  const ITEMS = [
    item({ key: "recurring:3:2026-09", title: "電費", date: "2026-09-20", state: "overdue", carriedOver: true, ruleId: 3, actionable: true }),
    item({ key: "recurring:7:2026-10", title: "健身房", date: "2026-10-01", state: "skipped", ruleId: 7 }),
    item({ key: "recurring:9:2026-10", title: "保險", date: "2026-10-02", state: "done", doneOn: "2026-10-06", ruleId: 9 }),
    item({ key: "card:9:2026-09-15", title: "玉山卡", kind: "card", date: "2026-10-03", state: "done", amount: 2400, doneOn: "2026-10-01", cardId: 9, cardStage: "paid" }),
    item({ key: "card:6:2026-10-05", title: "國泰卡", kind: "card", date: "2026-10-05", state: "todo", amount: 7000, estimated: true, cardId: 6, actionable: true, cardStage: "needs-bill" }),
    item({ key: "recurring:1:2026-10", title: "薪水", kind: "salary", date: "2026-10-10", state: "done", amount: 52000, doneOn: "2026-10-10", ruleId: 1 }),
    item({ key: "recurring:5:2026-10", title: "Netflix", date: "2026-10-12", state: "auto-done", amount: 390, doneOn: "2026-10-12", ruleId: 5 }),
    item({ key: "recurring:3:2026-10", title: "電費", date: "2026-10-20", state: "todo", amount: 1800, ruleId: 3 }),
    item({ key: "card:7:2026-10-25", title: "台新卡", kind: "card", date: "2026-10-25", state: "todo", amount: null, cardId: 7, cardStage: "unbilled" }),
    item({ key: "recurring:8:2026-10", title: "手機費", date: "2026-10-28", state: "auto", amount: 599, ruleId: 8 }),
    item({ key: "recurring:4:2026-11", title: "房租收入", date: "2026-11-03", state: "todo", upcoming: true, ruleId: 4 }),
  ];
  const ENTRIES = [entry("card:6:2026-10-05", "bill"), entry("recurring:3:2026-10", "confirm"), entry("recurring:3:2026-09", "confirm"), entry("recurring:1:2026-10", "allocate")];
  const rows = checklistRows({ items: ITEMS, entries: ENTRIES, today: TODAY, incomeRules: new Set([4]) });
  const rowOf = (key: string) => rows.find((row) => row.key === key)!;

  it("日期與狀態分開：上個月沒做完的標「上個月」；做完的寫哪天完成，還沒到的寫還有幾天；信用卡寫結帳或截止", () => {
    expect(rows.map((row) => [row.title, row.date, row.note])).toEqual([
      ["電費", "上個月 9/20", null],
      ["健身房", "10/1", "已略過"],
      ["保險", "10/2", "10/6 完成"],
      ["玉山卡", "10/3 截止", "10/1 繳清"],
      ["國泰卡", "10/5 已結帳", "待填帳單"],
      ["薪水", "10/10", "完成"],
      ["Netflix", "10/12", "已自動記帳"],
      ["電費", "10/20", "先處理前一期"],
      ["台新卡", "10/25 結帳", "結帳後填帳單"],
      ["手機費", "10/28", "自動記帳"],
      ["房租收入", "11/3", "還有 19 天"],
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
  const category = (id: number, name: string, kind: "income" | "expense", icon: string | null, monthlyBudget: number | null = null): CategoryLike & { icon: string | null } => ({ id, name, kind, monthlyBudget, icon });
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

describe("urgentRows：不能再放著的事，放在首頁與總覽的提示列", () => {
  const row = (fields: Partial<ChecklistRow>): ChecklistRow => ({ key: "k", title: "CUBE 卡", state: "todo", date: "11/5", note: null, amountText: "$1,200", badge: null, entry: null, ...fields });
  const bill = { row: { action: "bill" } } as PendingEntry;
  const confirm = { row: { action: "confirm" } } as PendingEntry;

  it("逾期的是紅色，寫出逾期幾天與金額", () => {
    expect(urgentRows([row({ state: "overdue", badge: { label: "逾期 2 天", tone: "danger" } })])).toEqual([{ key: "k", tone: "danger", title: "CUBE 卡", detail: "逾期 2 天 $1,200" }]);
  });

  it("等著填的帳單是提醒，金額讀不到時不留多的空白", () => {
    expect(urgentRows([row({ entry: bill, amountText: "" })])).toEqual([{ key: "k", tone: "warning", title: "CUBE 卡", detail: "待填帳單" }]);
  });

  it("還沒到期、做完的都不提醒：這些留在這個月要做的事", () => {
    expect(urgentRows([row({ entry: confirm }), row({ state: "done" }), row({ state: "auto" })])).toEqual([]);
  });
});
