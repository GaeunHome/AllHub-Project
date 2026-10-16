import { billDefaults, billStatus, cardBill, payableDueDate, type BillDefaults, type CardBill, type CardBillStatus, type CardDailyFlow } from "../lib/cards";
import { MIN_DATE, dueText, formatSlashDate, type DateKey } from "../lib/dates";
import { accountsWithHoldings, estimateRegularBuy, investmentTotals, profitPercentOf, valueHolding, type HoldingLike, type InvestmentValue } from "../lib/holdings";
import { ACCOUNT_KIND_LABELS, CARD_STYLES, type AccountKind, type CardStyle, type EntryKind } from "../lib/kinds";
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
} from "../lib/ledger";
import { formatNumber, formatSignedTwd, formatTwd } from "../lib/money";
import { dateToMonth, formatMonth, formatMonthShort, type MonthKey } from "../lib/month";
import type { PendingItem, PendingRuleRow } from "../lib/pending";
import { formatPrice, type Quote } from "../lib/quotes";
import type { CardBillRecord } from "../service/cards";
import type { AccountDraft } from "./components/forms/account-form";
import type { AccountOption, CategoryOption, EntryFormOptions, SalaryAccountOption } from "./components/forms/options";
import type { BalanceAccount } from "./components/forms/update-balance";
import { SAVINGS_PATHS } from "./paths";
import type { AccountUsage } from "./settings-display";

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

/** 停用的帳戶不算進總覽與表單 順序跟帳戶頁一樣 */
export function activeAccountsInOrder<T extends Pick<AccountLike, "id" | "active" | "sortOrder">>(accounts: T[]): T[] {
  return accounts.filter((account) => account.active).sort(bySortOrder);
}

/**
 * 扣款帳戶是信用卡換成轉帳時繳卡費的轉出
 * 開始記帳的日期是日期欄位的下限
 */
export const formExtras = (account: AccountLike) => ({ payFromAccountId: account.payFromAccountId, startDate: accountStartDate(account) });

type CategoryChoice = Pick<CategoryLike, "id" | "name" | "kind"> & { icon?: string | null };

/** 交給表單的分類只帶這幾個欄位 */
export const categoryOptions = (categories: CategoryChoice[]): CategoryOption[] => categories.map(({ id, name, kind, icon }) => ({ id, name, kind, icon: icon ?? null }));

/** withHoldings 是有持股的投資帳戶 一般轉帳轉不進也轉不出 要用買進賣出 */
export function entryFormOptions(accounts: AccountLike[], categories: CategoryChoice[], today: string, withHoldings: ReadonlySet<number> = new Set()): EntryFormOptions {
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

/**
 * 總覽要的帳戶欄位 信用卡多了結帳日與自動扣繳 dueDay 只當第一張帳單截止日的預設
 * label 是用途 cardStyle 是信用卡的卡面顏色 沒帶當成沒設
 */
export type OverviewAccount = AccountLike & { statementDay: number | null; autopay: boolean; dueDay: number | null; label?: string | null; cardStyle?: CardStyle | null };

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
  /** 每張卡填帳單視窗的預設 帳戶頁與這個月要做的事用同一份 */
  fills: Map<number, BillDefaults>;
  /** 有持股的投資帳戶 一般轉帳轉不進也轉不出 */
  withHoldings: Set<number>;
  /** 啟用中的存款餘額加投資市值 有持股的投資帳戶用持股的市值 */
  totalAssets: number;
};

export function accountsState({ accounts, flows, holdings, quotes, cardFlows, cardBills, today }: AccountsInput): AccountsState {
  const balances = accountBalances(accounts, flows);
  const investments = investmentTotals(holdings, quotes);
  const cards = accounts.filter((account) => account.kind === "credit");
  const balanceOf = (card: OverviewAccount) => balances.get(card.id)?.balance ?? 0;
  const bills = new Map(cards.map((card) => [card.id, cardBill(card, balanceOf(card), cardFlows, today, cardBills)]));
  const fills = new Map(cards.map((card) => [card.id, billDefaults(card, balanceOf(card), cardFlows, today, cardBills)]));
  return { balances, investments, bills, fills, withHoldings: accountsWithHoldings(holdings), totalAssets: assetSummary(accounts, balances, "active", investments).assets };
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

/** 一檔持股的市值與損益 settlementAccountId 是買賣時預設的存款帳戶 */
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
 * 填帳單視窗先填好的內容 dueDate 是帳單上印的日子 shiftedDueDate 是遇假日順延後的
 * statementDate 是 null 的卡沒有結帳日 填的那天就是結帳日
 */
export type BillDraft = Omit<PayCardDraft, "amount"> & { estimate: number; statementDate: DateKey | null; dueDate: DateKey; shiftedDueDate?: DateKey };

/** 信用卡的最近幾期 dueDate 是遇假日順延後的 status 是已繳清 未繳或逾期 */
export type BillHistoryRow = Pick<CardBillRecord, "id" | "statementDate" | "dueDate" | "amount" | "paid" | "lastPaidOn"> & { status: "paid" | "unpaid" | "overdue" };

/** recordsHref 打開紀錄頁篩好這個帳戶 */
type DetailBase = { id: number; name: string; recordsHref: string };

export type DepositDetail = DetailBase & {
  kind: "deposit";
  balance: number;
  /** 用途 例如生活費 */
  label: string | null;
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
  /** 這一期填的帳單 還沒填時是 null */
  statementAmount: number | null;
  /** 這一期的結帳日 沒有結帳日的卡還沒填過帳單時是 null */
  statementDate: DateKey | null;
  /** 帳單的截止日 遇假日順延後的 還沒填帳單時是 null */
  dueDate: DateKey | null;
  status: CardBillStatus;
  daysLeft: number | null;
  statementDay: number | null;
  autopay: boolean;
  /** 扣款帳戶繳完所有從它扣的卡費後還剩多少 */
  payFrom: { name: string; remaining: number; short: boolean } | null;
  /** 這一期還沒填帳單 本期應繳是照紀錄估的 */
  needsBill: boolean;
  pay: PayCardDraft;
  bill: BillDraft;
  /** 新的在前 */
  history: BillHistoryRow[];
};

export type AccountDetail = DepositDetail | InvestmentDetail | CreditDetail;

type Badge = { label: string; tone: "danger" | "warning" };

const ZERO_BALANCE: AccountBalance = { balance: 0, cost: null, profit: null, owed: null };

function depositDetail(account: OverviewAccount, base: DetailBase, balance: AccountBalance): DepositDetail {
  const target = targetProgress(account.targetAmount, balance.balance);
  return {
    ...base,
    kind: "deposit",
    balance: balance.balance,
    label: account.label ?? null,
    monthlyPlan: account.monthlyPlan,
    target: target && { amount: target.target, percent: target.percent, reached: target.reached },
  };
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

function creditDetail(account: OverviewAccount, base: DetailBase, balance: AccountBalance, bill: CardBill, fill: BillDefaults, status: CardStatus | undefined, names: ReadonlyMap<number, string>, input: AccountsInput): CreditDetail {
  const payFromName = account.payFromAccountId === null ? undefined : names.get(account.payFromAccountId);
  const minDate = accountStartDate(account);
  const history = input.cardBills
    .filter((record) => record.accountId === account.id)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id - a.id)
    .map(({ id, statementDate, dueDate, amount, paid, lastPaidOn }): BillHistoryRow => ({ id, statementDate, dueDate: payableDueDate(dueDate), amount, paid, lastPaidOn, status: billStatus({ amount, paid, dueDate }, input.today) }));
  return {
    ...base,
    kind: "credit",
    balance: balance.balance,
    owedNow: bill.owedNow,
    remainingDue: bill.remainingDue,
    statementAmount: bill.statementAmount,
    statementDate: bill.statementDate,
    dueDate: bill.dueDate,
    status: bill.status,
    daysLeft: bill.daysLeft,
    statementDay: account.statementDay,
    autopay: account.autopay,
    payFrom: payFromName !== undefined && status && status.payFromRemaining !== null ? { name: payFromName, remaining: status.payFromRemaining, short: status.short } : null,
    needsBill: bill.needsBill,
    pay: { cardId: account.id, cardName: account.name, amount: bill.remainingDue > 0 ? bill.remainingDue : bill.owedNow, payFromAccountId: account.payFromAccountId, minDate },
    bill: billDraft({ cardId: account.id, cardName: account.name, payFromAccountId: account.payFromAccountId, minDate }, fill, account.statementDay === null ? null : fill.statementDate),
    history,
  };
}

/** 沒有結帳日的卡標題不寫結帳日 填的那天就是 */
const billDraft = (card: Omit<PayCardDraft, "amount">, fill: BillDefaults, statementDate: DateKey | null): BillDraft => ({
  ...card,
  estimate: fill.estimate,
  statementDate,
  dueDate: fill.dueDate,
  shiftedDueDate: fill.shiftedDueDate,
});

/** 截止日過了還沒繳 */
export function creditOverdue<T extends Pick<CreditDetail, "status" | "daysLeft" | "remainingDue">>(detail: T): detail is T & { daysLeft: number } {
  return detail.status === "overdue" && detail.daysLeft !== null && detail.remainingDue > 0;
}

const GROUP_ORDER: readonly AccountKind[] = ["deposit", "investment", "credit"];

/** 啟用中的帳戶 順序跟帳戶頁一樣 settlement 是持股買賣預設的扣款帳戶 */
export function accountDetails(input: AccountsInput, state: AccountsState, settlement: ReadonlyMap<number, number> = new Map()): AccountDetail[] {
  const names = new Map(input.accounts.map((account) => [account.id, account.name]));
  const statuses = new Map(creditCardStatuses(input.accounts, state.balances, state.bills).map((status) => [status.accountId, status]));
  const current = dateToMonth(input.today);

  return activeAccountsInOrder(input.accounts).map((account): AccountDetail => {
    const balance = state.balances.get(account.id) ?? ZERO_BALANCE;
    const base = { id: account.id, name: account.name, recordsHref: accountRecordsHref(account.id, input.flows, current) };
    if (account.kind === "deposit") return depositDetail(account, base, balance);
    if (account.kind === "investment") return investmentDetail(account, base, balance, input.holdings, input.quotes, settlement, state.investments.get(account.id));
    const bill = state.bills.get(account.id) ?? cardBill(account, balance.balance, [], input.today);
    const fill = state.fills.get(account.id) ?? billDefaults(account, balance.balance, [], input.today);
    return creditDetail(account, base, balance, bill, fill, statuses.get(account.id), names, input);
  });
}

/** 能更新餘額的帳戶 信用卡照帳單繳 有持股的投資帳戶照股價算 都不列 */
export function balanceAccounts(accounts: AccountLike[], state: Pick<AccountsState, "balances" | "withHoldings">): BalanceAccount[] {
  return activeAccountsInOrder(accounts).flatMap((account) =>
    account.kind === "credit" || state.withHoldings.has(account.id) ? [] : [{ id: account.id, name: account.name, kind: account.kind, balance: state.balances.get(account.id)?.balance ?? 0 }],
  );
}

/**
 * 沒選卡面顏色的照建立順序輪流 跳過別張選走的顏色
 * 停用的卡也算在順序裡 停用別張卡時顏色才不會跟著換
 */
export function cardStyles(accounts: readonly Pick<OverviewAccount, "id" | "kind" | "createdAt" | "cardStyle">[]): Map<number, CardStyle> {
  const cards = accounts.filter((account) => account.kind === "credit").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  const chosen = new Set(cards.flatMap((card) => (card.cardStyle ? [card.cardStyle] : [])));
  const free = CARD_STYLES.filter((style) => !chosen.has(style));
  const palette = free.length > 0 ? free : CARD_STYLES;
  let next = 0;
  return new Map(cards.map((card) => [card.id, card.cardStyle ?? palette[next++ % palette.length]]));
}

/** 信用卡卡面下面那一行 action 是這張卡現在要按的 標籤只給待填帳單與逾期 */
export type CardStatusView = { text: string; badge: Badge | null; action: "bill" | "pay" | null };

type CardStatusSource = Pick<CreditDetail, "needsBill" | "statementDate" | "dueDate" | "remainingDue" | "statementAmount" | "owedNow" | "balance" | "status" | "daysLeft" | "statementDay">;

/**
 * 結帳了要填帳單 填了還沒繳清要繳 沒有結帳日的卡帳單來了隨時可以填
 * 繳了一部分時寫還要繳多少 才不會以為整張都沒繳
 */
export function cardStatusView(detail: CardStatusSource): CardStatusView {
  if (detail.needsBill && detail.statementDate !== null) {
    return { text: `${formatSlashDate(detail.statementDate)} 已結帳`, badge: { label: "待填帳單", tone: "warning" }, action: "bill" };
  }
  if (detail.dueDate !== null && detail.remainingDue > 0) {
    const paidSome = detail.statementAmount !== null && detail.remainingDue < detail.statementAmount;
    const amount = `${paidSome ? "本期還要繳" : "本期"} ${formatTwd(detail.remainingDue)}`;
    if (creditOverdue(detail)) return { text: `${amount} · ${formatSlashDate(detail.dueDate)} 截止`, badge: overdueBadge(detail.daysLeft), action: "pay" };
    const dueOn = `${formatSlashDate(detail.dueDate)} 截止`;
    const due = detail.daysLeft === 0 ? "今天截止" : detail.daysLeft === null ? dueOn : `${dueOn} · ${dueText(detail.daysLeft)}`;
    return { text: `${amount} · ${due}`, badge: null, action: "pay" };
  }
  const action = detail.statementDay === null ? "bill" : null;
  if (detail.balance > 0) return { text: `溢繳 ${formatTwd(detail.balance)}`, badge: null, action };
  if (detail.statementAmount !== null) {
    const settled = detail.statementAmount > 0 ? "本期已繳清" : "本期不用繳";
    // 還沒結帳的消費叫未出帳 跟銀行 App 一樣
    return { text: detail.owedNow > 0 ? `${settled} · 未出帳 ${formatTwd(detail.owedNow)}` : settled, badge: null, action };
  }
  return { text: detail.owedNow > 0 ? `未出帳 ${formatTwd(detail.owedNow)}` : "沒有未繳", badge: null, action };
}

type RuleAccounts = { accountId: number; counterAccountId: number | null };

/** 刪除帳戶前的確認要說的 會一起刪的固定收支有幾筆 有沒有紀錄與轉帳 */
export function accountUsage(id: number, rules: readonly RuleAccounts[], flows: readonly AccountMonthFlow[]): AccountUsage {
  const own = flows.filter((flow) => flow.accountId === id);
  return {
    recurringCount: rules.filter((rule) => rule.accountId === id || rule.counterAccountId === id).length,
    hasRecords: own.length > 0,
    hasTransfers: own.some((flow) => flow.transferIn > 0 || flow.transferOut > 0),
  };
}

/** 修改帳戶的視窗帶入的原本設定 不帶 userId */
export const accountDraft = (account: OverviewAccount): AccountDraft => ({
  id: account.id,
  name: account.name,
  kind: account.kind,
  label: account.label ?? null,
  cardStyle: account.cardStyle ?? null,
  openingBalance: account.openingBalance,
  openingCost: account.openingCost,
  monthlyPlan: account.monthlyPlan,
  targetAmount: account.targetAmount,
  statementDay: account.statementDay,
  payFromAccountId: account.payFromAccountId,
  autopay: account.autopay,
});

/** 卡面下方的字 只寫自己設的 沒有卡號 */
function faceLines(account: OverviewAccount, payFromName: string | undefined): string[] {
  const statement = account.statementDay === null ? "沒有設定結帳日" : `每月 ${account.statementDay} 日結帳`;
  const payment = [payFromName === undefined ? null : `從${payFromName}扣款`, account.autopay ? "自動扣繳" : null].filter((part) => part !== null).join(" · ");
  return payment ? [statement, payment] : [statement];
}

/** 修改的表單 刪除前的確認與上移下移 上移下移只在同一類啟用中的帳戶裡 */
type ManagedAccount = { draft: AccountDraft; usage: AccountUsage; isFirst: boolean; isLast: boolean };

export type DepositCardView = ManagedAccount & { detail: DepositDetail };

/** style 是卡面的顏色 faceLines 是卡面下方的字 status 是卡面下面那一行 */
export type CreditCardView = ManagedAccount & { detail: CreditDetail; style: CardStyle; faceLines: string[]; status: CardStatusView };

/** detail 寫類型與用途 */
export type InactiveAccountView = { id: number; name: string; detail: string; draft: AccountDraft; usage: AccountUsage };

export type AccountsPageView = {
  deposits: DepositCardView[];
  /** 啟用中的存款餘額合計 */
  depositTotal: number;
  cards: CreditCardView[];
  /** 啟用中的信用卡目前未繳合計 */
  owedTotal: number;
  /** 照存款 投資 信用卡排 證券帳戶停用後也在這裡恢復 */
  inactive: InactiveAccountView[];
  /** 信用卡扣款帳戶的選項 停用的也帶上 修改時才留得住原本選的 */
  payFromAccounts: { id: number; name: string; active: boolean }[];
};

/** rules 是固定收支 刪除帳戶時會一起刪 */
export function accountsPageView(input: AccountsInput, state: AccountsState, rules: readonly RuleAccounts[]): AccountsPageView {
  const details = new Map(accountDetails(input, state).map((detail) => [detail.id, detail]));
  const names = new Map(input.accounts.map((account) => [account.id, account.name]));
  const styles = cardStyles(input.accounts);
  const active = activeAccountsInOrder(input.accounts);
  const ofKind = (kind: AccountKind) => active.filter((account) => account.kind === kind);
  const managed = (account: OverviewAccount, index: number, count: number): ManagedAccount => ({
    draft: accountDraft(account),
    usage: accountUsage(account.id, rules, input.flows),
    isFirst: index === 0,
    isLast: index === count - 1,
  });

  const deposits = ofKind("deposit").flatMap((account, index, list): DepositCardView[] => {
    const detail = details.get(account.id);
    return detail?.kind === "deposit" ? [{ ...managed(account, index, list.length), detail }] : [];
  });
  const cards = ofKind("credit").flatMap((account, index, list): CreditCardView[] => {
    const detail = details.get(account.id);
    if (detail?.kind !== "credit") return [];
    const payFromName = account.payFromAccountId === null ? undefined : names.get(account.payFromAccountId);
    return [{ ...managed(account, index, list.length), detail, style: styles.get(account.id) ?? CARD_STYLES[0], faceLines: faceLines(account, payFromName), status: cardStatusView(detail) }];
  });
  const inactive = input.accounts
    .filter((account) => !account.active)
    .sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || bySortOrder(a, b))
    .map((account): InactiveAccountView => ({
      id: account.id,
      name: account.name,
      detail: [ACCOUNT_KIND_LABELS[account.kind], account.label].filter(Boolean).join(" · "),
      draft: accountDraft(account),
      usage: accountUsage(account.id, rules, input.flows),
    }));

  return {
    deposits,
    depositTotal: deposits.reduce((sum, card) => sum + card.detail.balance, 0),
    cards,
    owedTotal: cards.reduce((sum, card) => sum + card.detail.owedNow, 0),
    inactive,
    payFromAccounts: input.accounts
      .filter((account) => account.kind === "deposit")
      .sort(bySortOrder)
      .map(({ id, name, active }) => ({ id, name, active })),
  };
}

/** 定期定額的持股從哪個存款帳戶扣款 買賣時預設用它 */
export function settlementAccounts(rules: Pick<PendingRuleRow, "holdingId" | "accountId">[]): Map<number, number> {
  return new Map(rules.flatMap((rule) => (rule.holdingId === null ? [] : [[rule.holdingId, rule.accountId] as const])));
}

export type PendingAction = "bill" | "pay" | "confirm" | "allocate";

/** key 跟這個月要做的事那一列的一樣 action 是那一列的按鈕 */
export type PendingRowView = { key: string; action: PendingAction };

function pendingRowView(item: PendingItem): PendingRowView {
  return { key: item.key, action: item.type === "card" ? (item.needsBill ? "bill" : "pay") : item.allocate ? "allocate" : "confirm" };
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
 * 要處理的那一列與它的視窗要先填好的內容 每種動作各帶一種
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
  /** 填帳單視窗的預設 accountsState 算好的 */
  fills: ReadonlyMap<number, BillDefaults>;
  today: DateKey;
};

const latest = (dates: DateKey[]) => dates.reduce((a, b) => (b > a ? b : a), MIN_DATE);

/** 備註留空時伺服器記下的字 跟它用同一個規則 沒有預設時給個例子 */
function notePlaceholder(rule: PendingRuleRow, symbol: string | null): string {
  if (symbol !== null) return `留空會寫「買進 ${symbol} N 股」`;
  const fallback = rule.note ?? rule.name;
  return fallback ? `留空會寫「${fallback}」` : "例如：10 月電費";
}

export function pendingEntries(items: PendingItem[], { accounts, rules, holdings, quotes, categories, fills, today }: PendingSources): PendingEntry[] {
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
      if (!item.needsBill) return [{ row, rule: null, pay: { ...card, amount: item.amount } }];
      const fill = fills.get(item.accountId);
      return fill ? [{ row, rule: null, bill: billDraft(card, fill, item.statementDate) }] : [];
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
