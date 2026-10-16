import { describe, expect, it } from "vitest";
import type { CardDailyFlow } from "../lib/cards";
import type { HoldingLike } from "../lib/holdings";
import type { AccountBalance, AccountMonthFlow, CategoryMonthTotal } from "../lib/ledger";
import { pendingItems, type PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import { CARD_STYLES } from "../lib/kinds";
import type { CardBillRecord } from "../service/cards";
import {
  accountDetails,
  accountRecordsHref,
  accountsPageView,
  accountsState,
  activeAccountsInOrder,
  averagePriceText,
  balanceAccounts,
  cardStyles,
  expenseRows,
  pendingEntries,
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
  account({ id: 1, name: "台銀", kind: "deposit", label: "交割", openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", label: "生活費", openingBalance: 86000 }),
  account({ id: 3, name: "緊急預備金 A", kind: "deposit", openingBalance: 8200, targetAmount: 10000 }),
  account({ id: 4, name: "臺銀證券", kind: "investment", openingBalance: 100000, openingCost: 100000 }),
  account({ id: 5, name: "元大證券", kind: "investment", openingBalance: 50000, openingCost: 45000 }),
  // 國泰卡與台新卡帳戶上的繳款截止日只當第一張帳單截止日的預設
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, dueDay: 20, payFromAccountId: 2 }),
  account({ id: 7, name: "台新卡", kind: "credit", dueDay: 25, autopay: true, payFromAccountId: 2, openingBalance: -3000 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
];
const flow =(accountId: number, month: string, values: Partial<AccountMonthFlow>): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
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
const detailsOf = (overrides: Partial<AccountsInput> = {}) => {
  const data = input(overrides);
  return accountDetails(data, accountsState(data));
};
const detailOf = (name: string, overrides: Partial<AccountsInput> = {}) => detailsOf(overrides).find((detail) => detail.name === name)!;
const cardOf = (name: string, overrides: Partial<AccountsInput> = {}) => detailOf(name, overrides) as CreditDetail;

describe("總資產與帳戶的詳情", () => {
  it("總資產是啟用中的存款餘額加投資市值；有持股的投資帳戶用股數 × 收盤價，不看帳上的餘額", () => {
    // 存款 8,300 + 86,000 + 8,200 投資 1,000 股 × 106.50 + 100 股 × 195.00 + 沒有持股的 50,000 停用的與信用卡不算
    expect(accountsState(input()).totalAssets).toBe(278500);
  });

  it("停用的帳戶不出現", () => {
    expect(detailsOf().map((detail) => detail.name)).not.toContain("舊帳戶");
  });

  it("投資有持股：市值照收盤價，損益是市值減成本、百分比相對成本；持股照市值由大到小", () => {
    // 市值 126,000 成本 113,000 賺 13,000 是成本的 11.5%
    expect(detailOf("臺銀證券")).toMatchObject({ value: 126000, cost: 113000, profit: 13000, profitPercent: 11.5, priced: true });
    expect((detailOf("臺銀證券") as InvestmentDetail).holdings.map((holding) => holding.symbol)).toEqual(["006208", "0050"]);
  });

  it("投資有持股但讀不到股價：市值先用成本，標成讀不到", () => {
    expect(detailOf("臺銀證券", { quotes: null })).toMatchObject({ value: 113000, priced: false });
  });

  it("投資沒有持股：用帳上的市值與成本", () => {
    expect(detailOf("元大證券")).toMatchObject({ value: 50000, cost: 45000, profit: 5000 });
  });

  it("信用卡：目前未繳含結帳後還沒出帳的新消費，本期應繳照帳單", () => {
    // 10/5 結帳的帳單 12,480 之後又刷 6,000 目前未繳 18,480
    expect(cardOf("國泰卡")).toMatchObject({ owedNow: 18480, remainingDue: 12480 });
  });

  it("信用卡的截止日照帳單填的：台新卡（沒有結帳日）還沒填帳單時沒有截止日（帳戶上的 25 日不用）；填了 10/25（週日、10/26 補假）是順延後的 10/27", () => {
    const taishinBill: CardBillRecord = { id: 2, accountId: 7, statementDate: "2026-10-15", dueDate: "2026-10-25", amount: 3000, paid: 0, lastPaidOn: null };

    expect(cardOf("台新卡").dueDate).toBeNull();
    expect(cardOf("台新卡", { cardBills: [BILL, taishinBill] }).dueDate).toBe("2026-10-27");
  });

  it("扣款帳戶繳完本期應繳就不夠時，兩張從它扣款的卡都算不夠扣", () => {
    const poorer = ACCOUNTS.map((item) => (item.id === 2 ? { ...item, openingBalance: 10000 } : item));

    // 12,480 + 3,000 比 10,000 多 5,480
    expect(cardOf("國泰卡", { accounts: poorer }).payFrom).toEqual({ name: "生活費帳戶", remaining: -5480, short: true });
    expect(cardOf("台新卡", { accounts: poorer }).payFrom?.short).toBe(true);
  });
});

describe("信用卡的帳單（填帳單，差額自動補）", () => {
  const pendingOf = (cardBills: CardBillRecord[]) => {
    const data = input({ cardBills });
    const state = accountsState(data);
    const items = pendingItems([], [...state.bills.values()], TODAY, { accounts: ACCOUNTS, categories: [], holdings: HOLDINGS });
    return pendingEntries(items, { accounts: ACCOUNTS, rules: [], holdings: HOLDINGS, quotes: QUOTES, categories: [], fills: state.fills, today: TODAY }).find((entry) => entry.row.key.startsWith("card:6:"))!;
  };

  it("結帳後還沒填這一期的帳單：按鈕是「填帳單」，金額先填照紀錄估的；還沒有帳單時截止日先用帳戶上的 20 日", () => {
    const entry = pendingOf([]);

    expect(entry.row.action).toBe("bill");
    // 帳單金額先填紀錄算的 10/5 結帳時欠 12,480
    expect(entry.bill).toMatchObject({ cardId: 6, estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2 });
    expect(entry.pay).toBeUndefined();
  });

  it("截止日的預設照上一張帳單截止日的日子：9/5 那張填了 9/25，10/5 結帳的預設是帳單上會印的 10/25，遇假日順延到 10/27 另外帶著（舊版設的 20 日不看）；帳戶詳情的「填本期帳單」也一樣", () => {
    const previous: CardBillRecord = { id: 3, accountId: 6, statementDate: "2026-09-05", dueDate: "2026-09-25", amount: 9000, paid: 9000, lastPaidOn: "2026-09-20" };
    const expected = { statementDate: "2026-10-05", dueDate: "2026-10-25", shiftedDueDate: "2026-10-27" };

    expect(pendingOf([previous]).bill).toMatchObject(expected);
    expect(cardOf("國泰卡", { cardBills: [previous] }).bill).toMatchObject(expected);
  });

  it("填了帳單還沒繳清：按鈕回到「已繳」，金額是帳單減掉結帳後繳的（帳單 13,000 比紀錄多 520 也照帳單）", () => {
    const entry = pendingOf([{ ...BILL, amount: 13000 }]);

    expect(entry.row.action).toBe("pay");
    expect(entry.pay).toMatchObject({ cardId: 6, amount: 13000, payFromAccountId: 2 });
  });

  it("帳戶詳情的最近幾期：新的在前；繳清了是已繳清，過了截止日還沒繳清是逾期，其他是未繳；截止日寫順延後的（填 9/20 週日 → 9/21）", () => {
    const bills: CardBillRecord[] = [
      { id: 7, accountId: 6, statementDate: "2026-08-05", dueDate: "2026-08-20", amount: 5000, paid: 5000, lastPaidOn: "2026-08-18" },
      { id: 9, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null },
      { id: 8, accountId: 6, statementDate: "2026-09-05", dueDate: "2026-09-20", amount: 7000, paid: 2000, lastPaidOn: "2026-09-10" },
      { id: 3, accountId: 7, statementDate: "2026-09-25", dueDate: "2026-10-27", amount: 3000, paid: 0, lastPaidOn: null },
    ];
    const detail = cardOf("國泰卡", { cardBills: bills });

    expect(detail.history.map((bill) => [bill.statementDate, bill.dueDate, bill.status])).toEqual([
      ["2026-10-05", "2026-10-20", "unpaid"],
      ["2026-09-05", "2026-09-21", "overdue"],
      ["2026-08-05", "2026-08-20", "paid"],
    ]);
  });

  it("沒有結帳日的卡也能「填本期帳單」：填的那天（10/15）就是結帳日；截止日先填舊版設的 25 日（10/25，遇假日順延到 10/27），也沒有舊設定時是結帳後 15 天（10/30 週五，不用順延）", () => {
    const withoutSetting = ACCOUNTS.map((item) => (item.id === 7 ? { ...item, dueDay: null } : item));

    expect(cardOf("台新卡").bill).toMatchObject({ cardId: 7, statementDate: null, estimate: 3000, dueDate: "2026-10-25", shiftedDueDate: "2026-10-27" });
    expect(cardOf("台新卡", { accounts: withoutSetting }).bill).toMatchObject({ dueDate: "2026-10-30", shiftedDueDate: "2026-10-30" });
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
  const entries = pendingEntries(items, { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: QUOTES, categories: CATEGORIES, fills: state.fills, today: TODAY });
  // 照 key 找 card 開頭的是卡 recurring 開頭的是固定收支 後面接 id
  const entryOf = (key: string) => entries.find((entry) => entry.row.key.startsWith(key))!;

  it("卡費按「已繳」：先填本期應繳與這張卡的扣款帳戶", () => {
    expect(entryOf("card:6:")).toMatchObject({ row: { action: "pay" }, rule: null, pay: { cardId: 6, amount: 12480, payFromAccountId: 2 } });
  });

  it("薪水按「入帳並分配」：發薪分配先填好入帳帳戶、預計金額、分類與那一期的日期，送出時帶規則與那一期", () => {
    expect(entryOf("recurring:1:")).toMatchObject({ row: { action: "allocate" }, salary: { ruleId: 1, period: "2026-10", amount: 52000, accountId: 2, categoryId: 11, date: "2026-10-20" } });
  });

  it("定期定額：用收盤價先估好股數與扣款（手續費 1 元含在約定金額裡）", () => {
    // (5,000 - 1) × 100 / 10,650 = 46.9 取 46 股 價金 46 × 106.50 = 4,899 加手續費 1 元
    expect(entryOf("recurring:2:").confirm).toMatchObject({ where: "台銀 → 臺銀證券", regularBuy: { symbol: "006208", closeCents: 10650, quoteDate: "2026-10-14", estimate: { shares: 46, cost: 4900 } } });
  });

  it("定期定額讀不到股價：不估，欄位留空", () => {
    const [entry] = pendingEntries(
      items.filter((item) => item.name === "006208 定期定額"),
      { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: null, categories: CATEGORIES, fills: state.fills, today: TODAY },
    );

    expect(entry.confirm?.regularBuy).toMatchObject({ closeCents: null, estimate: null });
  });

  it("確認的日期預設那一期的日期，不能早於帳戶開始記帳的那天（收支沒有轉入的帳戶）", () => {
    expect(entryOf("recurring:3:").confirm).toMatchObject({ period: "2026-08", date: "2026-08-08", minDate: "2026-01-05", where: "生活費帳戶 · 水電" });
  });

  it("還沒到的那一期先確認時，日期預設今天，不能記未來", () => {
    const today = "2026-10-14";
    const early = pendingItems(RULES, [], today, { accounts: ACCOUNTS, categories: CATEGORIES, holdings: HOLDINGS }).filter((item) => item.name === "006208 定期定額");
    const [entry] = pendingEntries(early, { accounts: ACCOUNTS, rules: RULES, holdings: HOLDINGS, quotes: QUOTES, categories: CATEGORIES, fills: state.fills, today });

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

describe("帳戶頁", () => {
  const pageOf = (overrides: Partial<AccountsInput> = {}, rules: { accountId: number; counterAccountId: number | null }[] = []) => {
    const data = input(overrides);
    return accountsPageView(data, accountsState(data), rules);
  };
  const cardOf = (name: string, overrides: Partial<AccountsInput> = {}) => pageOf(overrides).cards.find((card) => card.detail.name === name)!;

  it("存款與信用卡各自照帳戶的順序（證券帳戶在投資頁）；停用的不分類型都收在「已停用」，照存款、投資、信用卡排", () => {
    const view = pageOf({ accounts: [...ACCOUNTS, account({ id: 9, name: "舊卡", kind: "credit", active: false }), account({ id: 10, name: "舊證券", kind: "investment", label: "退休", active: false })] });

    expect(view.deposits.map((card) => card.detail.name)).toEqual(["台銀", "生活費帳戶", "緊急預備金 A"]);
    expect(view.cards.map((card) => card.detail.name)).toEqual(["國泰卡", "台新卡"]);
    expect(view.inactive.map((item) => [item.name, item.detail])).toEqual([
      ["舊帳戶", "存款"],
      ["舊證券", "投資 · 退休"],
      ["舊卡", "信用卡"],
    ]);
  });

  it("存款的合計是啟用中的餘額相加，信用卡的合計是目前未繳相加", () => {
    // 存款 8,300 + 86,000 + 8,200 停用的 9,000 不算 未繳 國泰卡 12,480 + 6,000 台新卡 3,000
    expect(pageOf()).toMatchObject({ depositTotal: 102500, owedTotal: 21480 });
  });

  it("上移、下移只在同一類啟用中的帳戶裡：每類第一個不能上移、最後一個不能下移", () => {
    const view = pageOf();

    expect(view.deposits.map((card) => [card.isFirst, card.isLast])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(view.cards.map((card) => [card.isFirst, card.isLast])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("刪除前的確認要說的：轉出或轉入是它的固定收支都算、有沒有紀錄、有沒有轉帳（轉帳刪掉後另一個帳戶的餘額會變）", () => {
    const flows = [...FLOWS, flow(2, "2026-10", { income: 52000, transferOut: 5000 }), flow(1, "2026-10", { transferIn: 5000 })];
    const rules = [
      { accountId: 2, counterAccountId: null },
      { accountId: 2, counterAccountId: 1 },
      { accountId: 6, counterAccountId: null },
    ];
    const usageOf = (name: string) => pageOf({ flows }, rules).deposits.find((card) => card.detail.name === name)!.usage;

    expect(usageOf("生活費帳戶")).toEqual({ recurringCount: 2, hasRecords: true, hasTransfers: true });
    expect(usageOf("台銀")).toEqual({ recurringCount: 1, hasRecords: true, hasTransfers: true });
    expect(usageOf("緊急預備金 A")).toEqual({ recurringCount: 0, hasRecords: false, hasTransfers: false });
  });

  it("信用卡的扣款帳戶只能選存款帳戶；停用的也帶上（修改時原本選的才留得住）", () => {
    expect(pageOf().payFromAccounts).toEqual([
      { id: 1, name: "台銀", active: true },
      { id: 2, name: "生活費帳戶", active: true },
      { id: 3, name: "緊急預備金 A", active: true },
      { id: 8, name: "舊帳戶", active: false },
    ]);
  });

  it("卡面寫出結帳日、扣款帳戶與自動扣繳（沒有卡號）", () => {
    expect(cardOf("國泰卡").faceLines.join(" ")).toMatch(/每月 5 日結帳.*生活費帳戶/);
    expect(cardOf("台新卡").faceLines.join(" ")).toMatch(/生活費帳戶.*自動扣繳/);
  });

  it("卡面顏色：選了的照選的；沒選的照信用卡建立的順序輪流、跳過別張選走的顏色，停用的卡也算在順序裡（停用一張卡，別張的顏色不會跟著換）", () => {
    const created = (month: number) => new Date(Date.UTC(2026, month - 1, 1));
    const cards = [
      account({ id: 21, name: "A", kind: "credit", createdAt: created(1) }),
      account({ id: 22, name: "B", kind: "credit", createdAt: created(2), active: false }),
      account({ id: 23, name: "C", kind: "credit", createdAt: created(3), cardStyle: "silver" }),
      // id 比較小但比較晚建立
      account({ id: 20, name: "D", kind: "credit", createdAt: created(4) }),
    ];

    expect(cardStyles(cards)).toEqual(
      new Map([
        [21, "blue"],
        [22, "green"],
        [23, "silver"],
        [20, "purple"],
      ]),
    );
  });

  it("一張選了綠色、另一張沒選_沒選的不會也是綠色（發生過兩張卡同色）", () => {
    const cards = [account({ id: 1, name: "國泰卡", kind: "credit", cardStyle: "green" }), account({ id: 2, name: "台新卡", kind: "credit" })];

    expect(cardStyles(cards).get(2)).not.toBe("green");
  });

  it("卡面顏色輪完一圈從頭開始", () => {
    const cards = Array.from({ length: CARD_STYLES.length + 1 }, (_, i) => account({ id: i + 1, name: `卡 ${i + 1}`, kind: "credit" }));

    expect(cardStyles(cards).get(CARD_STYLES.length + 1)).toBe(CARD_STYLES[0]);
  });

  describe("卡面下面的狀態與要按的按鈕", () => {
    // 國泰卡 10/5 結帳的帳單 12,480 10/20 截止 之後又刷了 6,000
    const paid = (amount: number) => ({
      flows: [...FLOWS, flow(6, "2026-10", { transferIn: amount })],
      cardFlows: [...CARD_FLOWS, dayFlow(6, "2026-10-12", { transferIn: amount })],
      cardBills: [{ ...BILL, paid: amount, lastPaidOn: "2026-10-12" }],
    });

    it("結帳了還沒填帳單：寫結帳日，標「待填帳單」，按鈕是填帳單（還不知道截止日）", () => {
      expect(cardOf("國泰卡", { cardBills: [] }).status).toEqual({ text: "10/5 已結帳", badge: { label: "待填帳單", tone: "warning" }, action: "bill" });
    });

    it("填了還沒繳：本期金額、截止日與還有幾天，按鈕是已繳", () => {
      expect(cardOf("國泰卡").status).toEqual({ text: "本期 $12,480 · 10/20 截止 · 還有 5 天", badge: null, action: "pay" });
    });

    it("截止日過了還沒繳：標「逾期 N 天」（不再寫還有幾天）", () => {
      expect(cardOf("國泰卡", { today: "2026-10-22" }).status).toEqual({ text: "本期 $12,480 · 10/20 截止", badge: { label: "逾期 2 天", tone: "danger" }, action: "pay" });
    });

    it("繳了一部分：寫還要繳多少（12,480 繳了 5,000 還要 7,480），不寫成整張帳單", () => {
      expect(cardOf("國泰卡", paid(5000)).status.text).toBe("本期還要繳 $7,480 · 10/20 截止 · 還有 5 天");
    });

    it("繳清了：寫本期已繳清與還沒出帳的刷卡，沒有要按的", () => {
      expect(cardOf("國泰卡", paid(12480)).status).toEqual({ text: "本期已繳清 · 未出帳 $6,000", badge: null, action: null });
    });

    it("沒有結帳日的卡：不會自動要填，帳單來了隨時可以按填帳單；填了還沒繳清就換成已繳", () => {
      const taishinBill: CardBillRecord = { id: 2, accountId: 7, statementDate: "2026-10-15", dueDate: "2026-10-25", amount: 3000, paid: 0, lastPaidOn: null };

      expect(cardOf("台新卡").status).toEqual({ text: "未出帳 $3,000", badge: null, action: "bill" });
      // 10/25 是週日 10/26 補假 順延到 10/27
      expect(cardOf("台新卡", { cardBills: [BILL, taishinBill] }).status).toEqual({ text: "本期 $3,000 · 10/27 截止 · 還有 12 天", badge: null, action: "pay" });
    });
  });
});

describe("更新餘額能選的帳戶", () => {
  it("存款與沒有持股的投資帳戶，用目前的餘額；信用卡照帳單繳、有持股的照股價算、停用的，都不列", () => {
    const data = input();

    expect(balanceAccounts(data.accounts, accountsState(data))).toEqual([
      { id: 1, name: "台銀", kind: "deposit", balance: 8300 },
      { id: 2, name: "生活費帳戶", kind: "deposit", balance: 86000 },
      { id: 3, name: "緊急預備金 A", kind: "deposit", balance: 8200 },
      { id: 5, name: "元大證券", kind: "investment", balance: 50000 },
    ]);
  });
});
