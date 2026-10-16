import { describe, expect, it } from "vitest";
import type { CardDailyFlow } from "../lib/cards";
import type { HoldingLike } from "../lib/holdings";
import type { AccountBalance, AccountMonthFlow, CategoryMonthTotal } from "../lib/ledger";
import { pendingItems, type PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import type { CardBillRecord } from "../service/cards";
import {
  accountGroups,
  accountRecordsHref,
  accountsState,
  activeAccountsInOrder,
  averagePriceText,
  creditRowText,
  expenseRows,
  pendingEntries,
  pendingRowView,
  periodLabel,
  recordsHref,
  salaryAccountOptions,
  settlementAccounts,
  type AccountsInput,
  type CreditDetail,
  type InvestmentDetail,
  type OverviewAccount,
} from "./dashboard-view";

const CREATED = new Date("2026-01-05T02:00:00Z");
const TODAY = "2026-10-15";

type AccountFixture = Pick<OverviewAccount, "id" | "name" | "kind"> & Partial<OverviewAccount>;
const account = (fixture: AccountFixture): OverviewAccount => ({
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
  account({ id: 1, name: "台銀", kind: "deposit", purposeId: 1, openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", purposeId: 2, openingBalance: 86000 }),
  account({ id: 3, name: "緊急預備金 A", kind: "deposit", openingBalance: 8200, targetAmount: 10000 }),
  account({ id: 4, name: "臺銀證券", kind: "investment", openingBalance: 100000, openingCost: 100000 }),
  account({ id: 5, name: "元大證券", kind: "investment", openingBalance: 50000, openingCost: 45000 }),
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, dueDay: 20, payFromAccountId: 2 }),
  account({ id: 7, name: "台新卡", kind: "credit", dueDay: 25, autopay: true, payFromAccountId: 2, openingBalance: -3000 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
];
const PURPOSES = [
  { id: 1, name: "交割", color: "blue" as const },
  { id: 2, name: "生活費", color: "teal" as const },
];
const flow = (accountId: number, month: string, values: Partial<AccountMonthFlow>): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
// 國泰卡 9/20 刷 12,480 是 10/5 結帳的帳單 10/10 再刷 6,000 還沒出帳
const FLOWS = [flow(6, "2026-09", { expense: 12480 }), flow(6, "2026-10", { expense: 6000 })];
const dayFlow = (accountId: number, date: string, values: Partial<CardDailyFlow>): CardDailyFlow => ({ accountId, date, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
const CARD_FLOWS = [dayFlow(6, "2026-09-20", { expense: 12480 }), dayFlow(6, "2026-10-10", { expense: 6000 })];
const holding = (id: number, symbol: string, name: string, shares: number, cost: number): HoldingLike => ({ id, accountId: 4, symbol, name, shares, cost, sortOrder: id });
const HOLDINGS = [holding(1, "0050", "元大台灣50", 100, 18000), holding(2, "006208", "富邦台50", 1000, 95000)];
const quote = (symbol: string, closeCents: number | null): Quote => ({ symbol, name: symbol, closeCents, date: closeCents === null ? null : "2026-10-14", market: "twse" });
const QUOTES = [quote("006208", 10650), quote("0050", 19500)];

// 國泰卡 10/5 結帳的帳單已經照銀行的填了 12,480 跟紀錄一樣
const BILL: CardBillRecord = { id: 1, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null };
const input = (overrides: Partial<AccountsInput> = {}): AccountsInput => ({ accounts: ACCOUNTS, flows: FLOWS, holdings: HOLDINGS, quotes: QUOTES, cardFlows: CARD_FLOWS, cardBills: [BILL], today: TODAY, ...overrides });
const groupsOf = (overrides: Partial<AccountsInput> = {}) => {
  const data = input(overrides);
  return accountGroups(data, accountsState(data), PURPOSES, new Map());
};
const rowOf = (name: string, overrides: Partial<AccountsInput> = {}) => groupsOf(overrides).flatMap((group) => group.rows).find((row) => row.name === name)!;

describe("總資產與帳戶的分組", () => {
  it("總資產是啟用中的存款餘額加投資市值；有持股的投資帳戶用股數 × 收盤價，不看帳上的餘額", () => {
    // 存款 8,300 + 86,000 + 8,200 投資 1,000 股 × 106.50 + 100 股 × 195.00 + 沒有持股的 50,000 停用的與信用卡不算
    expect(accountsState(input()).totalAssets).toBe(278500);
  });

  it("三組照存款、投資、信用卡排，小計各是餘額、市值與未繳的合計；停用的帳戶不出現", () => {
    const groups = groupsOf();

    expect(groups.map((group) => [group.kind, group.total])).toEqual([
      ["deposit", 102500],
      ["investment", 176000],
      ["credit", 21480],
    ]);
    expect(groups.flatMap((group) => group.rows.map((row) => row.name))).not.toContain("舊帳戶");
  });

  it("存款：說明寫用途，沒有用途寫「未設定用途」，有目標時寫出目標", () => {
    expect(rowOf("台銀").detail).toBe("交割");
    expect(rowOf("緊急預備金 A").detail).toBe("未設定用途 · 目標 $10,000");
  });

  it("投資有持股：寫市值最大的那一檔與檔數，損益是市值減成本、百分比相對成本", () => {
    const row = rowOf("臺銀證券");

    // 市值 126,000 成本 113,000 賺 13,000 是成本的 11.5%
    expect(row.amount).toBe(126000);
    // 百分比用半形括號 靠右對齊時數字才排得齊
    expect(row.detail).toBe("006208 等 2 檔 · 損益 +$13,000\u00a0(+11.5%)");
  });

  it("投資有持股但讀不到股價：市值先用成本，說明寫「股價暫時讀不到」", () => {
    const row = rowOf("臺銀證券", { quotes: null });

    expect(row.amount).toBe(113000);
    expect(row.detail).toBe("006208 等 2 檔 · 股價暫時讀不到");
    expect((row.account as InvestmentDetail).priced).toBe(false);
  });

  it("投資沒有持股：照舊用帳上的市值與成本", () => {
    const row = rowOf("元大證券");

    expect(row.amount).toBe(50000);
    expect(row.detail).toBe("損益 +$5,000\u00a0(+11.1%)");
  });

  it("信用卡：右邊是目前未繳；本期應繳跟它不一樣時才另外寫（結帳後的新消費還沒出帳）", () => {
    // 10/5 結帳的帳單 12,480 之後又刷 6,000 目前未繳 18,480
    expect(rowOf("國泰卡")).toMatchObject({ amount: 18480, detail: "10/20 截止 · 本期應繳 $12,480", badge: null });
    // 截止日 10/25 是星期日 10/26 補假 銀行順延到 10/27 依人事總處 2026 年辦公日曆表
    expect(rowOf("台新卡")).toMatchObject({ amount: 3000, detail: "10/27 截止 · 自動扣繳" });
  });

  it("扣款帳戶繳完本期應繳就不夠時，兩張從它扣款的卡都標「不夠扣」", () => {
    const poorer = ACCOUNTS.map((item) => (item.id === 2 ? { ...item, openingBalance: 10000 } : item));
    const card = rowOf("國泰卡", { accounts: poorer });

    // 12,480 + 3,000 比 10,000 多 5,480
    expect(card.badge).toEqual({ label: "不夠扣", tone: "warning" });
    expect(card.account).toMatchObject({ payFrom: { name: "生活費帳戶", remaining: -5480, short: true } });
    expect(rowOf("台新卡", { accounts: poorer }).badge).toEqual({ label: "不夠扣", tone: "warning" });
  });

  it("過了截止日還沒繳：標「逾期 N 天」（一列只有一個標籤）", () => {
    expect(rowOf("國泰卡", { today: "2026-10-22" }).badge).toEqual({ label: "逾期 2 天", tone: "danger" });
  });
});

describe("信用卡那一列的說明", () => {
  const card = { owedNow: 0, remainingDue: 0, statementAmount: null, dueDate: "2026-10-20", balance: 0, autopay: false, needsBill: false };

  it("這一期繳清後又刷了卡：右邊的未繳是還沒出帳的，說明要寫出這個數字是什麼", () => {
    expect(creditRowText({ ...card, statementAmount: 12480, owedNow: 2000 })).toContain("未出帳 $2,000");
  });
});

describe("信用卡的帳單（填帳單，差額自動補）", () => {
  const pendingOf = (cardBills: CardBillRecord[]) => {
    const data = input({ cardBills });
    const items = pendingItems([], [...accountsState(data).bills.values()], TODAY, { accounts: ACCOUNTS, categories: [], holdings: HOLDINGS });
    return pendingEntries(items, { accounts: ACCOUNTS, rules: [], holdings: HOLDINGS, quotes: QUOTES, categories: [], today: TODAY }).find((entry) => entry.row.name === "國泰卡")!;
  };

  it("結帳後還沒填這一期的帳單：那一列寫待填帳單；待處理的按鈕是「填帳單」，金額是照紀錄估的", () => {
    const entry = pendingOf([]);

    expect(rowOf("國泰卡", { cardBills: [] }).detail).toBe("10/20 截止 · 待填帳單");
    expect(entry.row).toMatchObject({ action: "bill", amountText: "約 $12,480" });
    // 帳單金額先填紀錄算的 10/5 結帳時欠 12,480
    expect(entry.bill).toMatchObject({ cardId: 6, estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2 });
    expect(entry.pay).toBeUndefined();
  });

  it("填了帳單還沒繳清：按鈕回到「已繳」，金額是帳單減掉結帳後繳的（帳單 13,000 比紀錄多 520 也照帳單）", () => {
    const entry = pendingOf([{ ...BILL, amount: 13000 }]);

    expect(entry.row).toMatchObject({ action: "pay", amountText: "$13,000" });
    expect(entry.pay).toMatchObject({ cardId: 6, amount: 13000, payFromAccountId: 2 });
  });

  it("帳戶詳情的最近幾期：新的在前；繳清了是已繳清，過了截止日還沒繳清是逾期，其他是未繳", () => {
    const bills: CardBillRecord[] = [
      { id: 7, accountId: 6, statementDate: "2026-08-05", dueDate: "2026-08-20", amount: 5000, paid: 5000, lastPaidOn: "2026-08-18" },
      { id: 9, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null },
      { id: 8, accountId: 6, statementDate: "2026-09-05", dueDate: "2026-09-21", amount: 7000, paid: 2000, lastPaidOn: "2026-09-10" },
      { id: 3, accountId: 7, statementDate: "2026-09-25", dueDate: "2026-10-27", amount: 3000, paid: 0, lastPaidOn: null },
    ];
    const detail = rowOf("國泰卡", { cardBills: bills }).account as CreditDetail;

    expect(detail.history.map((bill) => [bill.statementDate, bill.status])).toEqual([
      ["2026-10-05", "unpaid"],
      ["2026-09-05", "overdue"],
      ["2026-08-05", "paid"],
    ]);
  });

  it("沒設截止日的卡不用填帳單，詳情沒有「填本期帳單」", () => {
    const accounts = ACCOUNTS.map((item) => (item.id === 6 ? { ...item, dueDay: null } : item));

    expect((rowOf("國泰卡", { accounts }).account as CreditDetail).bill).toBeNull();
  });
});

describe("本月支出", () => {
  const category = (id: number, name: string, monthlyBudget: number | null) => ({ id, name, kind: "expense" as const, color: "blue" as const, monthlyBudget });
  const CATEGORIES = [category(1, "餐飲", 10000), category(2, "交通", null), category(3, "訂閱", 500), category(4, "娛樂", 3000)];
  const total = (categoryId: number | null, amount: number): CategoryMonthTotal => ({ categoryId, kind: "expense", month: "2026-10", amount });
  const rows = expenseRows(CATEGORIES, [total(1, 8200), total(2, 1900), total(3, 650), total(null, 1250)], "2026-10");

  it("照金額由大到小，沒分類的併成「未分類」；有預算但這個月還沒花的排在最後", () => {
    expect(rows.map((row) => [row.name, row.spent])).toEqual([
      ["餐飲", 8200],
      ["交通", 1900],
      ["未分類", 1250],
      ["訂閱", 650],
      ["娛樂", 0],
    ]);
  });

  it("長條只畫有預算的，是已用 / 預算（超過畫滿），只有超支才寫超過多少；沒預算的只寫金額", () => {
    const [food, transport, , subscription] = rows;

    expect(food).toMatchObject({ budget: 10000, barPercent: 82, over: 0 });
    expect(subscription).toMatchObject({ budget: 500, barPercent: 100, over: 150 });
    expect(transport).toMatchObject({ budget: null, barPercent: null, over: 0 });
  });

  it("點一列到紀錄頁篩好那個分類（未分類用 uncategorized）", () => {
    expect(rows[0].href).toBe("/savings/records?category=1");
    expect(rows[2].href).toBe("/savings/records?category=uncategorized");
  });
});

describe("紀錄頁的網址", () => {
  it("本月不帶月份；帳戶與分類照紀錄頁認得的參數帶上", () => {
    expect(recordsHref()).toBe("/savings/records");
    expect(recordsHref({ month: "2026-08", account: 4 })).toBe("/savings/records?month=2026-08&account=4");
  });
});

describe("待處理", () => {
  const rule = (fixture: Pick<PendingRuleRow, "id" | "kind" | "amount" | "accountId" | "dayOfMonth"> & Partial<PendingRuleRow>): PendingRuleRow => ({
    intervalMonths: 1,
    startMonth: null,
    holidayRule: "none",
    lastPostedMonth: "2026-09-01",
    createdAt: CREATED,
    mode: "confirm",
    active: true,
    counterAccountId: null,
    categoryId: null,
    holdingId: null,
    allocate: false,
    name: null,
    note: null,
    ...fixture,
  });
  const RULES = [
    rule({ id: 1, name: "薪水", kind: "income", amount: 52000, accountId: 2, categoryId: 11, dayOfMonth: 20, allocate: true }),
    rule({ id: 2, kind: "transfer", amount: 5000, accountId: 1, counterAccountId: 4, holdingId: 2, dayOfMonth: 15 }),
    // 每 2 個月 8 月開始 8 月那期還沒處理 10 月那期也到了
    rule({ id: 3, name: "電費", kind: "expense", amount: 1800, accountId: 2, categoryId: 12, dayOfMonth: 8, intervalMonths: 2, startMonth: "2026-08-01", lastPostedMonth: null, createdAt: new Date("2026-07-20T02:00:00Z") }),
    rule({ id: 4, name: "Netflix", kind: "expense", amount: 390, accountId: 6, dayOfMonth: 12, mode: "auto" }),
  ];
  const CATEGORIES = [
    { id: 11, name: "薪水" },
    { id: 12, name: "水電" },
  ];
  const data = input();
  const state = accountsState(data);
  const items = pendingItems(RULES, [...state.bills.values()], TODAY, { accounts: ACCOUNTS, categories: CATEGORIES, holdings: HOLDINGS });
  const entries = pendingEntries(items, { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: QUOTES, categories: CATEGORIES, today: TODAY });
  const entryOf = (name: string) => entries.find((entry) => entry.row.name === name)!;

  it("到期寫「10/20 前 · 還有 5 天」「今天」，逾期改成標籤；同時有好幾期沒處理寫還有幾期；收入前面加 +", () => {
    // 台新卡沒有結帳日 截止日順延到 10/27 還有 12 天 截止前 10 天內才列
    expect(entries.map(({ row }) => [row.name, row.detail, row.badge?.label ?? null, row.amountText])).toEqual([
      ["電費", "支出 · 8/8 · 還有 1 期", "逾期 68 天", "$1,800"],
      ["006208 定期定額", "定期定額 · 10/15 · 今天", null, "$5,000"],
      ["國泰卡", "繳卡費 · 10/20 前 · 還有 5 天", null, "$12,480"],
      ["薪水", "收入 · 10/20 · 還有 5 天", null, "+$52,000"],
    ]);
  });

  it("卡費按「已繳」：先填本期應繳與這張卡的扣款帳戶", () => {
    expect(entryOf("國泰卡")).toMatchObject({ row: { action: "pay" }, rule: null, pay: { cardId: 6, amount: 12480, payFromAccountId: 2 } });
  });

  it("薪水按「入帳並分配」：發薪分配先填好入帳帳戶、預計金額、分類與那一期的日期，送出時帶規則與那一期", () => {
    expect(entryOf("薪水")).toMatchObject({ row: { action: "allocate" }, salary: { ruleId: 1, period: "2026-10", amount: 52000, accountId: 2, categoryId: 11, date: "2026-10-20" } });
  });

  it("定期定額：用收盤價先估好股數與扣款（手續費 1 元含在約定金額裡）", () => {
    // (5,000 - 1) × 100 / 10,650 = 46.9 取 46 股 價金 46 × 106.50 = 4,899 加手續費 1 元
    expect(entryOf("006208 定期定額").confirm).toMatchObject({ where: "台銀 → 臺銀證券", regularBuy: { symbol: "006208", closeCents: 10650, quoteDate: "2026-10-14", estimate: { shares: 46, cost: 4900 } } });
  });

  it("定期定額讀不到股價：不估，欄位留空", () => {
    const [entry] = pendingEntries(
      items.filter((item) => item.name === "006208 定期定額"),
      { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: null, categories: CATEGORIES, today: TODAY },
    );

    expect(entry.confirm?.regularBuy).toMatchObject({ closeCents: null, estimate: null });
  });

  it("確認的日期預設那一期的日期，不能早於帳戶開始記帳的那天（收支沒有轉入的帳戶）", () => {
    expect(entryOf("電費").confirm).toMatchObject({ period: "2026-08", date: "2026-08-08", minDate: "2026-01-05", where: "生活費帳戶 · 水電" });
  });

  it("還沒到的那一期先確認時，日期預設今天，不能記未來", () => {
    const today = "2026-10-14";
    const early = pendingItems(RULES, [], today, { accounts: ACCOUNTS, categories: CATEGORIES, holdings: HOLDINGS }).filter((item) => item.name === "006208 定期定額");
    const [entry] = pendingEntries(early, { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: QUOTES, categories: CATEGORIES, today });

    expect(pendingRowView(early[0]).detail).toBe("定期定額 · 10/15 · 還有 1 天");
    expect(entry.confirm?.date).toBe(today);
  });

  it("定期定額的持股買賣時，預設從規則的扣款帳戶扣款", () => {
    expect(settlementAccounts(RULES)).toEqual(new Map([[2, 1]]));
  });
});

describe("月份的稱呼", () => {
  it("這個月是「本月」，同一年的其他月份只寫月，不同年加上年份", () => {
    expect(periodLabel("2026-10", "2026-10")).toBe("本月");
    expect(periodLabel("2026-09", "2026-10")).toBe("9 月");
    expect(periodLabel("2025-12", "2026-10")).toBe("2025 年 12 月");
  });
});

describe("薪水入帳並分配的帳戶", () => {
  it("帶上目前的餘額；有持股的投資帳戶不能入帳也不能轉入（要用買進賣出），不列；停用的帳戶不列", () => {
    const balances = new Map<number, AccountBalance>([
      [2, { balance: 52000, cost: null, profit: null, owed: null }],
      [5, { balance: 50000, cost: 45000, profit: 5000, owed: null }],
    ]);
    const options = salaryAccountOptions(ACCOUNTS, balances, new Set([4]));

    expect(options.find((option) => option.id === 2)?.balance).toBe(52000);
    expect(options.find((option) => option.id === 5)?.balance).toBe(50000);
    expect(options.map((option) => option.id)).not.toContain(4);
    expect(options.map((option) => option.id)).not.toContain(8);
  });
});

describe("交給表單的帳戶", () => {
  it("只有啟用中的，照設定頁的順序", () => {
    const shuffled = [account({ id: 3, name: "上海", kind: "deposit", sortOrder: 2 }), account({ id: 1, name: "國泰", kind: "deposit", sortOrder: 1 }), account({ id: 2, name: "舊帳戶", kind: "deposit", active: false })];

    expect(activeAccountsInOrder(shuffled).map((item) => item.name)).toEqual(["國泰", "上海"]);
  });
});

describe("帳戶詳情的「查看紀錄」", () => {
  const flows = [flow(1, "2026-08", { income: 100 }), flow(2, "2026-10", { expense: 50 }), flow(2, "2026-09", { expense: 70 }), flow(3, "2026-09", { transferIn: 1000 })];

  it("連到這個帳戶最近有紀錄的月份，紀錄頁一打開就看得到；最近的是本月時不帶月份", () => {
    expect(accountRecordsHref(1, flows, "2026-10")).toBe("/savings/records?month=2026-08&account=1");
    expect(accountRecordsHref(2, flows, "2026-10")).toBe("/savings/records?account=2");
  });

  it("只有轉入的帳戶也算有紀錄；完全沒有紀錄的連到本月", () => {
    expect(accountRecordsHref(3, flows, "2026-10")).toBe("/savings/records?month=2026-09&account=3");
    expect(accountRecordsHref(9, flows, "2026-10")).toBe("/savings/records?account=9");
  });
});

describe("持股的均價", () => {
  it("總成本除以股數，到小數兩位（27,600 元買 120 股是 $230.00、1,000 元買 3 股是 $333.33）", () => {
    expect(averagePriceText({ shares: 120, cost: 27600 })).toBe("$230.00");
    expect(averagePriceText({ shares: 3, cost: 1000 })).toBe("$333.33");
  });

  it("賣光了（0 股）_沒有均價", () => {
    expect(averagePriceText({ shares: 0, cost: 0 })).toBeNull();
  });
});
