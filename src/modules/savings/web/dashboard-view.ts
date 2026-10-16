import { billStatus, cardBill, currentStatement, type CardBill, type CardDailyFlow } from "../lib/cards";
import { MIN_DATE, dueText, formatSlashDate, type DateKey } from "../lib/dates";
import { accountsWithHoldings, estimateRegularBuy, investmentTotals, profitPercentOf, valueHolding, type HoldingLike, type InvestmentValue } from "../lib/holdings";
import { TRANSACTION_KIND_LABELS, type AccountKind, type EntryKind } from "../lib/kinds";
import {
  UNCATEGORIZED_KEY,
  accountBalances,
  accountStartDate,
  assetSummary,
  budgetRows,
  bySortOrder,
  creditCardStatuses,
  expenseSlices,
  targetProgress,
  type AccountBalance,
  type AccountLike,
  type AccountMonthFlow,
  type CardStatus,
  type CategoryLike,
  type CategoryMonthTotal,
  type PurposeLike,
} from "../lib/ledger";
import { formatNumber, formatSignedTwd, formatTwd } from "../lib/money";
import { dateToMonth, formatMonth, formatMonthShort, type MonthKey } from "../lib/month";
import type { PendingItem, PendingRuleRow, PendingStatus } from "../lib/pending";
import { formatPrice, type Quote } from "../lib/quotes";
import type { CardBillRecord } from "../service/cards";
import type { AccountOption, CategoryOption, EntryFormOptions, SalaryAccountOption } from "./components/forms/options";
import { plannedAmount } from "./entry-display";
import { SAVINGS_PATHS } from "./paths";

// 伺服器元件整理好畫面與表單要的形狀 交給 client 元件的只帶用得到的欄位

/** 這個月寫本月 同一年只寫月份 不同年才加年份 */
export function periodLabel(month: MonthKey, current: MonthKey): string {
  if (month === current) return "本月";
  return month.slice(0, 4) === current.slice(0, 4) ? formatMonthShort(month) : formatMonth(month);
}

/** 損益的百分比 到小數一位 正的帶加號 四捨五入成 0 時不帶符號 */
export function formatSignedPercent(percent: number): string {
  const fixed = percent.toFixed(1);
  if (fixed === "0.0" || fixed === "-0.0") return "0.0%";
  return percent > 0 ? `+${fixed}%` : `${fixed}%`;
}

/**
 * 損益加上相對成本的百分比 成本是 0 時不寫百分比
 * 括號用半形 靠右對齊時一欄的數字才排得齊 中間不換行
 */
export function profitText(profit: number, percent: number | null): string {
  return percent === null ? formatSignedTwd(profit) : `${formatSignedTwd(profit)}\u00a0(${formatSignedPercent(percent)})`;
}

export const formatShares = (shares: number) => `${formatNumber(shares)} 股`;

/** 股價存成整數的分 例如 $258.70 */
export const priceText = (closeCents: number) => `$${formatPrice(closeCents)}`;

/** 總成本除以股數 寫法跟收盤價一樣才好比 賣光的沒有均價 */
export function averagePriceText({ shares, cost }: { shares: number; cost: number }): string | null {
  return shares > 0 ? priceText(Math.round((cost * 100) / shares)) : null;
}

/** 逾期的標籤 一列最多一個標籤 只給要處理的狀態 */
export const overdueBadge = (daysLeft: number) => ({ label: dueText(daysLeft), tone: "danger" as const });

type RecordsFilter = { month?: MonthKey | null; account?: number; category?: number | typeof UNCATEGORIZED_KEY };

/** 紀錄頁的網址 本月不帶 month 帳戶與分類帶上後紀錄頁一打開就篩好 */
export function recordsHref({ month = null, account, category }: RecordsFilter = {}): string {
  const params = new URLSearchParams();
  if (month !== null) params.set("month", month);
  if (account !== undefined) params.set("account", String(account));
  if (category !== undefined) params.set("category", String(category));
  const query = params.toString();
  return query ? `${SAVINGS_PATHS.records}?${query}` : SAVINGS_PATHS.records;
}

export const monthRecordsHref = (month: MonthKey, current: MonthKey) => recordsHref({ month: month === current ? null : month });

/** 最近一筆紀錄在這個月之前時 直接打開那個月 不然紀錄頁一打開是空的 */
export function accountRecordsHref(accountId: number, flows: readonly Pick<AccountMonthFlow, "accountId" | "month">[], current: MonthKey): string {
  const latest = flows.reduce<MonthKey | null>((last, flow) => (flow.accountId === accountId && (last === null || flow.month > last) ? flow.month : last), null);
  return recordsHref({ month: latest === null || latest >= current ? null : latest, account: accountId });
}

/** 停用的帳戶不算進總覽與表單 順序跟設定頁一樣 */
export function activeAccountsInOrder<T extends Pick<AccountLike, "id" | "active" | "sortOrder">>(accounts: T[]): T[] {
  return accounts.filter((account) => account.active).sort(bySortOrder);
}

/**
 * 扣款帳戶是信用卡換成轉帳時繳卡費的轉出
 * 開始記帳的日期是日期欄位的下限
 */
export const formExtras = (account: AccountLike) => ({ payFromAccountId: account.payFromAccountId, startDate: accountStartDate(account) });

/** 交給表單的分類只帶這幾個欄位 */
export const categoryOptions = (categories: Pick<CategoryLike, "id" | "name" | "kind">[]): CategoryOption[] => categories.map(({ id, name, kind }) => ({ id, name, kind }));

/** withHoldings 是有持股的投資帳戶 一般轉帳轉不進也轉不出 要用買進賣出 */
export function entryFormOptions(accounts: AccountLike[], categories: Pick<CategoryLike, "id" | "name" | "kind">[], today: string, withHoldings: ReadonlySet<number> = new Set()): EntryFormOptions {
  return {
    accounts: activeAccountsInOrder(accounts).map((account) => ({ id: account.id, name: account.name, kind: account.kind, ...formExtras(account), withHoldings: withHoldings.has(account.id) })),
    categories: categoryOptions(categories),
    today,
  };
}

/** 繳卡費與買賣股票只能用存款帳戶 */
export function depositOptions(accounts: AccountLike[]): AccountOption[] {
  return activeAccountsInOrder(accounts)
    .filter((account) => account.kind === "deposit")
    .map((account) => ({ id: account.id, name: account.name, kind: account.kind, ...formExtras(account) }));
}

/** 建議金額要看目前的餘額 有持股的投資帳戶不能入帳也不能轉入 不列 */
export function salaryAccountOptions(accounts: AccountLike[], balances: Map<number, AccountBalance>, withHoldings: ReadonlySet<number>): SalaryAccountOption[] {
  return activeAccountsInOrder(accounts)
    .filter((account) => !withHoldings.has(account.id))
    .map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      ...formExtras(account),
      balance: balances.get(account.id)?.balance ?? 0,
      monthlyPlan: account.monthlyPlan,
      targetAmount: account.targetAmount,
      sortOrder: account.sortOrder,
    }));
}

/** 總覽要的帳戶欄位 信用卡多了結帳日與自動扣繳 */
export type OverviewAccount = AccountLike & { statementDay: number | null; autopay: boolean };

export type AccountsInput = {
  accounts: OverviewAccount[];
  flows: AccountMonthFlow[];
  holdings: HoldingLike[];
  /** 沒有持股時不查 是 null 讀不到也是 null */
  quotes: readonly Quote[] | null;
  /** 信用卡近 70 天每天的流量 算本期帳單用 */
  cardFlows: CardDailyFlow[];
  /** 每張卡最近 5 期填過的帳單 沒填的那一期照紀錄估 */
  cardBills: CardBillRecord[];
  today: DateKey;
};

/** 總資產 帳戶分組 待處理與首頁卡片都從這裡算 數字才一致 */
export type AccountsState = {
  balances: Map<number, AccountBalance>;
  investments: Map<number, InvestmentValue>;
  bills: Map<number, CardBill>;
  /** 有持股的投資帳戶 一般轉帳轉不進也轉不出 */
  withHoldings: Set<number>;
  /** 啟用中的存款餘額加投資市值 有持股的投資帳戶用持股的市值 */
  totalAssets: number;
};

export function accountsState({ accounts, flows, holdings, quotes, cardFlows, cardBills, today }: AccountsInput): AccountsState {
  const balances = accountBalances(accounts, flows);
  const investments = investmentTotals(holdings, quotes);
  const bills = new Map(accounts.filter((account) => account.kind === "credit").map((card) => [card.id, cardBill(card, balances.get(card.id)?.balance ?? 0, cardFlows, today, cardBills)]));
  return { balances, investments, bills, withHoldings: accountsWithHoldings(holdings), totalAssets: assetSummary(accounts, balances, "active", investments).assets };
}

/**
 * 本月支出的一列 長條只畫有預算的 意思是已用 / 預算
 * category 是紀錄頁篩選用的值 分類 id 或未分類
 */
export type ExpenseRow = { key: string; name: string; spent: number; budget: number | null; barPercent: number | null; over: number; category: string; href: string };

/**
 * 照金額由大到小 有設預算但還沒花的排在最後
 * 沒分類或分類已刪除的併成未分類 點了到紀錄頁篩好那個分類
 */
export function expenseRows(categories: CategoryLike[], totals: CategoryMonthTotal[], month: MonthKey): ExpenseRow[] {
  const budgets = new Map(budgetRows(categories, totals, month).map((row) => [row.categoryId, row]));
  const row = (key: string, name: string, spent: number, categoryId: number | null): ExpenseRow => {
    const budget = categoryId === null ? undefined : budgets.get(categoryId);
    const category = categoryId === null ? UNCATEGORIZED_KEY : String(categoryId);
    return {
      key,
      name,
      spent,
      budget: budget?.budget ?? null,
      barPercent: budget ? Math.min(100, budget.percent) : null,
      over: budget ? Math.max(0, spent - budget.budget) : 0,
      category,
      href: recordsHref({ category: categoryId ?? UNCATEGORIZED_KEY }),
    };
  };
  const spent = expenseSlices(categories, totals, month).map((slice) => row(slice.key, slice.label, slice.amount, slice.key === UNCATEGORIZED_KEY ? null : Number(slice.key.replace(/^category:/, ""))));
  const unspent = [...budgets.values()].filter((budget) => budget.spent === 0).map((budget) => row(`category:${budget.categoryId}`, budget.name, 0, budget.categoryId));
  return [...spent, ...unspent];
}

/** 帳戶詳情裡的一檔持股 settlementAccountId 是買賣時預設的存款帳戶 */
export type HoldingView = {
  id: number;
  symbol: string;
  name: string;
  shares: number;
  cost: number;
  closeCents: number | null;
  quoteDate: DateKey | null;
  value: number;
  profit: number;
  profitPercent: number | null;
  priced: boolean;
  settlementAccountId: number | null;
};

/** 繳卡費視窗先填好的內容 金額是本期應繳 沒有帳單時是目前未繳 */
export type PayCardDraft = { cardId: number; cardName: string; amount: number; payFromAccountId: number | null; minDate: DateKey };

/**
 * 填帳單視窗先填好的內容 estimate 是照紀錄算的這一期未繳 當帳單金額的預設
 * statementDate 是 null 的卡沒有結帳日 填的那天就是結帳日
 */
export type BillDraft = Omit<PayCardDraft, "amount"> & { estimate: number; statementDate: DateKey | null; dueDate: DateKey };

/** 帳戶詳情的最近幾期 status 是已繳清 未繳或逾期 */
export type BillHistoryRow = Pick<CardBillRecord, "id" | "statementDate" | "dueDate" | "amount" | "paid" | "lastPaidOn"> & { status: "paid" | "unpaid" | "overdue" };

/** recordsHref 打開紀錄頁篩好這個帳戶 */
type DetailBase = { id: number; name: string; recordsHref: string };

export type DepositDetail = DetailBase & {
  kind: "deposit";
  balance: number;
  purposeName: string | null;
  monthlyPlan: number | null;
  target: { amount: number; percent: number; reached: boolean } | null;
};

/** 有持股時市值與成本是持股的合計 沒有持股時是帳本的餘額 ledgerBalance 給更新市值用 */
export type InvestmentDetail = DetailBase & {
  kind: "investment";
  ledgerBalance: number;
  value: number;
  cost: number;
  profit: number;
  profitPercent: number | null;
  priced: boolean;
  quoteDate: DateKey | null;
  holdings: HoldingView[];
};

export type CreditDetail = DetailBase & {
  kind: "credit";
  /** 帳本的餘額 負的是未繳 正的是溢繳 */
  balance: number;
  owedNow: number;
  remainingDue: number;
  /** 結帳時的帳單 沒有結帳日時是 null */
  statementAmount: number | null;
  dueDate: DateKey | null;
  status: "none" | PendingStatus;
  daysLeft: number | null;
  statementDay: number | null;
  dueDay: number | null;
  autopay: boolean;
  /** 扣款帳戶繳完所有從它扣的卡費後還剩多少 */
  payFrom: { name: string; remaining: number; short: boolean } | null;
  /** 這一期還沒填帳單 本期應繳是照紀錄估的 */
  needsBill: boolean;
  pay: PayCardDraft;
  /** 沒有截止日的卡不用填帳單 是 null */
  bill: BillDraft | null;
  /** 新的在前 */
  history: BillHistoryRow[];
};

export type AccountDetail = DepositDetail | InvestmentDetail | CreditDetail;

/** 一個帳戶在總覽的一列 badge 只給要處理的狀態 */
export type AccountRowView = { id: number; name: string; detail: string; amount: number; badge: Badge | null; account: AccountDetail };

type Badge = { label: string; tone: "danger" | "warning" };

/** 一組帳戶 信用卡的小計是未繳 */
export type AccountGroupView = { kind: AccountKind; total: number; rows: AccountRowView[] };

const ZERO_BALANCE: AccountBalance = { balance: 0, cost: null, profit: null, owed: null };

function depositDetail(account: OverviewAccount, base: DetailBase, balance: AccountBalance, purposes: ReadonlyMap<number, PurposeLike>): DepositDetail {
  const target = targetProgress(account.targetAmount, balance.balance);
  return {
    ...base,
    kind: "deposit",
    balance: balance.balance,
    purposeName: account.purposeId === null ? null : (purposes.get(account.purposeId)?.name ?? null),
    monthlyPlan: account.monthlyPlan,
    target: target && { amount: target.target, percent: target.percent, reached: target.reached },
  };
}

function depositRow(detail: DepositDetail): Omit<AccountRowView, "account"> {
  const target = detail.target && (detail.target.reached ? "已達目標" : `目標 ${formatTwd(detail.target.amount)}`);
  return { id: detail.id, name: detail.name, detail: [detail.purposeName ?? "未設定用途", target].filter(Boolean).join(" · "), amount: detail.balance, badge: null };
}

/** 持股照市值由大到小 一樣大時照建立的順序 */
function investmentDetail(account: OverviewAccount, detailBase: DetailBase, balance: AccountBalance, holdings: HoldingLike[], quotes: readonly Quote[] | null, settlement: ReadonlyMap<number, number>, total: InvestmentValue | undefined): InvestmentDetail {
  const bySymbol = new Map((quotes ?? []).map((quote) => [quote.symbol, quote]));
  const views = holdings
    .filter((holding) => holding.accountId === account.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((holding): HoldingView => {
      const valued = valueHolding(holding, bySymbol.get(holding.symbol));
      return {
        id: holding.id,
        symbol: holding.symbol,
        name: holding.name,
        shares: holding.shares,
        cost: holding.cost,
        closeCents: valued.closeCents,
        quoteDate: valued.date,
        value: valued.value,
        profit: valued.profit,
        profitPercent: valued.profitPercent,
        priced: valued.priced,
        settlementAccountId: settlement.get(holding.id) ?? null,
      };
    })
    .sort((a, b) => b.value - a.value);
  const base = { ...detailBase, kind: "investment" as const, ledgerBalance: balance.balance, holdings: views };
  if (total && views.length > 0) return { ...base, value: total.value, cost: total.cost, profit: total.profit, profitPercent: total.profitPercent, priced: total.priced, quoteDate: total.date };
  const cost = balance.cost ?? balance.balance;
  const profit = balance.profit ?? 0;
  return { ...base, value: balance.balance, cost, profit, profitPercent: profitPercentOf(profit, cost), priced: true, quoteDate: null };
}

function investmentRow(detail: InvestmentDetail): Omit<AccountRowView, "account"> {
  const [first] = detail.holdings;
  const profit = detail.priced ? `損益 ${profitText(detail.profit, detail.profitPercent)}` : "股價暫時讀不到";
  const holdings = first ? `${first.symbol}${detail.holdings.length > 1 ? ` 等 ${detail.holdings.length} 檔` : ""}` : null;
  return { id: detail.id, name: detail.name, detail: [holdings, profit].filter(Boolean).join(" · "), amount: detail.value, badge: null };
}

function creditDetail(account: OverviewAccount, base: DetailBase, balance: AccountBalance, bill: CardBill, status: CardStatus | undefined, names: ReadonlyMap<number, string>, input: AccountsInput): CreditDetail {
  const payFromName = account.payFromAccountId === null ? undefined : names.get(account.payFromAccountId);
  const minDate = accountStartDate(account);
  const period = currentStatement(account, input.today);
  const history = input.cardBills
    .filter((record) => record.accountId === account.id)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id - a.id)
    .map(({ id, statementDate, dueDate, amount, paid, lastPaidOn }): BillHistoryRow => ({ id, statementDate, dueDate, amount, paid, lastPaidOn, status: billStatus({ amount, paid, dueDate }, input.today) }));
  return {
    ...base,
    kind: "credit",
    balance: balance.balance,
    owedNow: bill.owedNow,
    remainingDue: bill.remainingDue,
    statementAmount: bill.statementAmount,
    dueDate: bill.dueDate,
    status: bill.status,
    daysLeft: bill.daysLeft,
    statementDay: account.statementDay,
    dueDay: account.dueDay,
    autopay: account.autopay,
    payFrom: payFromName !== undefined && status && status.payFromRemaining !== null ? { name: payFromName, remaining: status.payFromRemaining, short: status.short } : null,
    needsBill: bill.needsBill,
    pay: { cardId: account.id, cardName: account.name, amount: bill.remainingDue > 0 ? bill.remainingDue : bill.owedNow, payFromAccountId: account.payFromAccountId, minDate },
    bill:
      period === null
        ? null
        : { cardId: account.id, cardName: account.name, estimate: bill.estimate, statementDate: account.statementDay === null ? null : period.statementDate, dueDate: period.dueDate, payFromAccountId: account.payFromAccountId, minDate },
    history,
  };
}

/**
 * 右邊是目前未繳 跟本期應繳不一樣時寫出各是多少 繳清後寫出右邊是未出帳
 * 還沒結帳的消費叫未出帳 跟銀行 App 一樣
 */
export function creditRowText(detail: Pick<CreditDetail, "owedNow" | "remainingDue" | "statementAmount" | "dueDate" | "balance" | "autopay" | "needsBill">): string {
  if (detail.balance > 0) return `溢繳 ${formatTwd(detail.balance)}`;
  if (detail.dueDate === null) return "未設定繳款截止日";
  const unbilled = detail.owedNow - detail.remainingDue;
  const parts: string[] = [];
  if (detail.needsBill) {
    parts.push(`${formatSlashDate(detail.dueDate)} 截止`, "待填帳單");
  } else if (detail.remainingDue > 0) {
    parts.push(`${formatSlashDate(detail.dueDate)} 截止`);
    if (unbilled > 0) parts.push(`本期應繳 ${formatTwd(detail.remainingDue)}`);
  } else if (detail.statementAmount !== null && detail.statementAmount > 0) {
    parts.push("本期已繳清");
    if (unbilled > 0) parts.push(`未出帳 ${formatTwd(unbilled)}`);
  } else {
    parts.push(detail.owedNow > 0 ? "未出帳" : "沒有未繳");
  }
  if (detail.autopay) parts.push("自動扣繳");
  return parts.join(" · ");
}

/** 截止日過了還沒繳 */
export function creditOverdue<T extends Pick<CreditDetail, "status" | "daysLeft" | "remainingDue">>(detail: T): detail is T & { daysLeft: number } {
  return detail.status === "overdue" && detail.daysLeft !== null && detail.remainingDue > 0;
}

function creditRow(detail: CreditDetail): Omit<AccountRowView, "account"> {
  const badge = creditOverdue(detail) ? overdueBadge(detail.daysLeft) : detail.payFrom?.short ? { label: "不夠扣", tone: "warning" as const } : null;
  return { id: detail.id, name: detail.name, detail: creditRowText(detail), amount: detail.owedNow, badge };
}

const GROUP_ORDER: readonly AccountKind[] = ["deposit", "investment", "credit"];

/** 啟用中的帳戶照類型分三組 順序跟設定頁一樣 沒有帳戶的組不出現 */
export function accountGroups(input: AccountsInput, state: AccountsState, purposes: PurposeLike[], settlement: ReadonlyMap<number, number>): AccountGroupView[] {
  const active = activeAccountsInOrder(input.accounts);
  const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));
  const names = new Map(input.accounts.map((account) => [account.id, account.name]));
  const statuses = new Map(creditCardStatuses(input.accounts, state.balances, state.bills).map((status) => [status.accountId, status]));
  const current = dateToMonth(input.today);

  const rows = active.map((account): AccountRowView => {
    const balance = state.balances.get(account.id) ?? ZERO_BALANCE;
    const base = { id: account.id, name: account.name, recordsHref: accountRecordsHref(account.id, input.flows, current) };
    if (account.kind === "deposit") {
      const detail = depositDetail(account, base, balance, purposeById);
      return { ...depositRow(detail), account: detail };
    }
    if (account.kind === "investment") {
      const detail = investmentDetail(account, base, balance, input.holdings, input.quotes, settlement, state.investments.get(account.id));
      return { ...investmentRow(detail), account: detail };
    }
    const bill = state.bills.get(account.id) ?? cardBill(account, balance.balance, [], input.today);
    const detail = creditDetail(account, base, balance, bill, statuses.get(account.id), names, input);
    return { ...creditRow(detail), account: detail };
  });

  return GROUP_ORDER.flatMap((kind) => {
    const inGroup = rows.filter((row) => row.account.kind === kind);
    return inGroup.length === 0 ? [] : [{ kind, total: inGroup.reduce((sum, row) => sum + row.amount, 0), rows: inGroup }];
  });
}

/** 定期定額的持股從哪個存款帳戶扣款 買賣時預設用它 */
export function settlementAccounts(rules: Pick<PendingRuleRow, "holdingId" | "accountId">[]): Map<number, number> {
  return new Map(rules.flatMap((rule) => (rule.holdingId === null ? [] : [[rule.holdingId, rule.accountId] as const])));
}

export type PendingAction = "bill" | "pay" | "confirm" | "allocate";

export type PendingRowView = {
  key: string;
  name: string;
  detail: string;
  /** 逾期的標籤 說明那一行就不再寫幾天 */
  badge: Badge | null;
  amountText: string;
  action: PendingAction;
};

function pendingType(item: PendingItem): string {
  if (item.type === "card") return item.autopay ? "自動扣繳" : "繳卡費";
  if (item.holdingId !== null) return "定期定額";
  return TRANSACTION_KIND_LABELS[item.kind];
}

/** 還沒填帳單時只是照紀錄估的 */
function pendingAmount(item: PendingItem): string {
  if (item.type === "recurring") return plannedAmount(item.kind, item.amount);
  if (!item.needsBill) return formatTwd(item.amount);
  return item.amount > 0 ? `約 ${formatTwd(item.amount)}` : "";
}

/** 卡費寫幾號前 固定收支寫那一期的日期 */
export const pendingDate = (item: PendingItem) => (item.type === "card" ? `${formatSlashDate(item.date)} 前` : formatSlashDate(item.date));

/** 逾期改用標籤 不在說明這一行重複 */
export function pendingRowView(item: PendingItem): PendingRowView {
  const overdue = item.status === "overdue";
  const later = item.type === "recurring" && item.laterCount > 0 ? `還有 ${item.laterCount} 期` : null;
  return {
    key: item.key,
    name: item.name,
    detail: [pendingType(item), pendingDate(item), overdue ? null : dueText(item.daysLeft), later].filter((part) => part !== null).join(" · "),
    badge: overdue ? overdueBadge(item.daysLeft) : null,
    amountText: pendingAmount(item),
    action: item.type === "card" ? (item.needsBill ? "bill" : "pay") : item.allocate ? "allocate" : "confirm",
  };
}

/** 確認的日期預設那一期的日期 還沒到的話先寫今天 不能記未來 */
export function confirmDate(occurrence: DateKey, today: DateKey): DateKey {
  return occurrence <= today ? occurrence : today;
}

/** 定期定額先估好的股數與扣款 沒有報價時是 null 欄位留空 */
export type RegularBuyDraft = { symbol: string; name: string; closeCents: number | null; quoteDate: DateKey | null; estimate: { shares: number; cost: number } | null };

/** 確認固定收支視窗先填好的內容 notePlaceholder 是備註留空時記下的字 */
export type ConfirmDraft = {
  ruleId: number;
  period: MonthKey;
  name: string;
  kind: EntryKind;
  amount: number;
  date: DateKey;
  minDate: DateKey;
  /** 帳戶與分類在這裡不能改 寫出來讓人確認記到哪裡 */
  where: string;
  notePlaceholder: string;
  regularBuy: RegularBuyDraft | null;
};

/** 待處理的薪水 那一期的金額 入帳帳戶 分類與日期先填好 送出時一起認領那一期 */
export type SalaryPrefill = { ruleId: number; period: MonthKey; amount: number; accountId: number; categoryId: number | null; date: DateKey };

/**
 * 待處理的一列與它的視窗要先填好的內容 每種動作各帶一種
 * rule 是固定收支才有的 ⋮ 略過這一期與修改
 */
export type PendingEntry = {
  row: PendingRowView;
  rule: { ruleId: number; period: MonthKey } | null;
  bill?: BillDraft;
  pay?: PayCardDraft;
  confirm?: ConfirmDraft;
  salary?: SalaryPrefill;
};

type PendingSources = {
  accounts: AccountLike[];
  rules: PendingRuleRow[];
  holdings: HoldingLike[];
  quotes: readonly Quote[] | null;
  categories: Pick<CategoryLike, "id" | "name">[];
  today: DateKey;
};

const latest = (dates: DateKey[]) => dates.reduce((a, b) => (b > a ? b : a), MIN_DATE);

/** 備註留空時伺服器記下的字 跟它用同一個規則 沒有預設時給個例子 */
function notePlaceholder(rule: PendingRuleRow, symbol: string | null): string {
  if (symbol !== null) return `留空會寫「買進 ${symbol} N 股」`;
  const fallback = rule.note ?? rule.name;
  return fallback ? `留空會寫「${fallback}」` : "例如：10 月電費";
}

export function pendingEntries(items: PendingItem[], { accounts, rules, holdings, quotes, categories, today }: PendingSources): PendingEntry[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const holdingById = new Map(holdings.map((holding) => [holding.id, holding]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const quoteBySymbol = new Map((quotes ?? []).map((quote) => [quote.symbol, quote]));
  // 收支沒有轉入的帳戶 只看用得到的帳戶開始記帳的日期
  const startOf = (...ids: (number | null)[]) => latest(ids.flatMap((id) => (id === null ? [] : [accountById.get(id)])).flatMap((account) => (account ? [accountStartDate(account)] : [])));

  return items.flatMap((item): PendingEntry[] => {
    const row = pendingRowView(item);
    if (item.type === "card") {
      const card = { cardId: item.accountId, cardName: item.name, payFromAccountId: item.payFromAccountId, minDate: startOf(item.accountId) };
      if (item.needsBill) return [{ row, rule: null, bill: { ...card, estimate: item.estimate, statementDate: item.statementDate, dueDate: item.date } }];
      return [{ row, rule: null, pay: { ...card, amount: item.amount } }];
    }
    const rule = ruleById.get(item.ruleId);
    if (!rule) return [];
    const ruleRef = { ruleId: item.ruleId, period: item.period };
    if (item.allocate) {
      return [{ row, rule: ruleRef, salary: { ruleId: item.ruleId, period: item.period, amount: item.amount, accountId: item.accountId, categoryId: item.categoryId, date: item.date } }];
    }
    const holding = item.holdingId === null ? undefined : holdingById.get(item.holdingId);
    const quote = holding ? quoteBySymbol.get(holding.symbol) : undefined;
    const accountName = accountById.get(item.accountId)?.name ?? "";
    const counterName = item.counterAccountId === null ? null : (accountById.get(item.counterAccountId)?.name ?? "");
    const categoryName = item.categoryId === null ? null : (categoryNames.get(item.categoryId) ?? null);
    const where = counterName !== null ? `${accountName} → ${counterName}` : [accountName, categoryName].filter(Boolean).join(" · ");
    return [
      {
        row,
        rule: ruleRef,
        confirm: {
          ruleId: item.ruleId,
          period: item.period,
          name: item.name,
          kind: item.kind,
          amount: item.amount,
          date: confirmDate(item.date, today),
          minDate: startOf(item.accountId, item.counterAccountId),
          where,
          notePlaceholder: notePlaceholder(rule, holding?.symbol ?? null),
          regularBuy: holding
            ? { symbol: holding.symbol, name: holding.name, closeCents: quote?.closeCents ?? null, quoteDate: quote?.date ?? null, estimate: estimateRegularBuy(item.amount, quote?.closeCents ?? null) }
            : null,
        },
      },
    ];
  });
}
