import { billDefaults, billStatus, cardBill, payableDueDate, type BillDefaults, type CardBill, type CardBillStatus } from "../lib/cards";
import { latestOf, type DateKey } from "../lib/dates";
import { profitPercentOf, valueHolding, type HoldingLike, type InvestmentValue } from "../lib/holdings";
import { accountStartDate, creditCardStatuses, targetProgress, type AccountBalance, type AccountMonthFlow, type CardStatus } from "../lib/ledger";
import { dateToMonth, type MonthKey } from "../lib/month";
import type { PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import type { CardBillRecord } from "../service/cards";
import type { AccountsInput, AccountsState, OverviewAccount } from "./accounts-state";
import { activeAccountsInOrder } from "./form-options";
import { recordsHref } from "./paths";

// 每個啟用中帳戶的數字 帳戶頁 投資頁與總覽共用

/** 最近一筆紀錄在這個月之前時 直接打開那個月 不然紀錄頁一打開是空的 */
export function accountRecordsHref(accountId: number, flows: readonly Pick<AccountMonthFlow, "accountId" | "month">[], current: MonthKey): string {
  const latest = latestOf(flows.filter((flow) => flow.accountId === accountId).map((flow) => flow.month));
  return recordsHref({ month: latest === null || latest >= current ? null : latest, account: accountId });
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
 * 填帳單視窗先填好的內容 dueDate 是帳單上印的日子
 * statementDate 是 null 的卡沒有結帳日 填的那天就是結帳日
 */
export type BillDraft = Omit<PayCardDraft, "amount"> & { estimate: number; statementDate: DateKey | null; dueDate: DateKey };

/** 信用卡的最近幾期 dueDate 是遇假日順延後的 status 是已繳清 未繳或逾期 */
export type BillHistoryRow = Pick<CardBillRecord, "id" | "statementDate" | "dueDate" | "amount" | "paid" | "lastPaidOn"> & { status: "paid" | "unpaid" | "overdue" };

/** recordsHref 打開紀錄頁篩好這個帳戶 */
type DetailBase = { id: number; name: string; recordsHref: string };

export type DepositDetail = DetailBase & {
  kind: "deposit";
  balance: number;
  /** 用途 例如生活費 */
  label: string | null;
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
  /** 結帳之後刷的 還沒算進任何一期 */
  unbilled: number;
  /** 這一期填的帳單 還沒填時是 null */
  statementAmount: number | null;
  /** 這一期的結帳日 沒有結帳日的卡還沒填過帳單時是 null */
  statementDate: DateKey | null;
  /** 帳單的截止日 遇假日順延後的 還沒填帳單時是 null */
  dueDate: DateKey | null;
  status: CardBillStatus;
  daysLeft: number | null;
  statementDay: number | null;
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

const ZERO_BALANCE: AccountBalance = { balance: 0, cost: null, profit: null, owed: null };

function depositDetail(account: OverviewAccount, base: DetailBase, balance: AccountBalance): DepositDetail {
  const target = targetProgress(account.targetAmount, balance.balance);
  return {
    ...base,
    kind: "deposit",
    balance: balance.balance,
    label: account.label ?? null,
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
    unbilled: bill.unbilled,
    statementAmount: bill.statementAmount,
    statementDate: bill.statementDate,
    dueDate: bill.dueDate,
    status: bill.status,
    daysLeft: bill.daysLeft,
    statementDay: account.statementDay,
    payFrom: payFromName !== undefined && status && status.payFromRemaining !== null ? { name: payFromName, remaining: status.payFromRemaining, short: status.short } : null,
    needsBill: bill.needsBill,
    pay: { cardId: account.id, cardName: account.name, amount: bill.remainingDue > 0 ? bill.remainingDue : bill.owedNow, payFromAccountId: account.payFromAccountId, minDate },
    bill: billDraft({ cardId: account.id, cardName: account.name, payFromAccountId: account.payFromAccountId, minDate }, fill, account.statementDay === null ? null : fill.statementDate),
    history,
  };
}

/** 沒有結帳日的卡標題不寫結帳日 填的那天就是 */
export const billDraft = (card: Omit<PayCardDraft, "amount">, fill: BillDefaults, statementDate: DateKey | null): BillDraft => ({ ...card, estimate: fill.estimate, statementDate, dueDate: fill.dueDate });

/** 截止日過了還沒繳 */
export function creditOverdue<T extends Pick<CreditDetail, "status" | "daysLeft" | "remainingDue">>(detail: T): detail is T & { daysLeft: number } {
  return detail.status === "overdue" && detail.daysLeft !== null && detail.remainingDue > 0;
}

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

/** 定期定額的持股從哪個存款帳戶扣款 買賣時預設用它 */
export function settlementAccounts(rules: Pick<PendingRuleRow, "holdingId" | "accountId">[]): Map<number, number> {
  return new Map(rules.flatMap((rule) => (rule.holdingId === null ? [] : [[rule.holdingId, rule.accountId] as const])));
}
