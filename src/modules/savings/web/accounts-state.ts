import { billDefaults, cardBill, type BillDefaults, type CardBill, type CardDailyFlow } from "../lib/cards";
import type { DateKey } from "../lib/dates";
import { accountsWithHoldings, investmentTotals, type HoldingLike, type InvestmentValue } from "../lib/holdings";
import type { CardStyle } from "../lib/kinds";
import { accountBalances, assetSummary, type AccountBalance, type AccountLike, type AccountMonthFlow, type AssetSummary } from "../lib/ledger";
import type { Quote } from "../lib/quotes";
import type { CardBillRecord } from "../service/cards";

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
  /** 啟用中帳戶的合計 總資產是存款餘額加投資市值 有持股的投資帳戶用持股的市值 */
  summary: AssetSummary;
};

export function accountsState({ accounts, flows, holdings, quotes, cardFlows, cardBills, today }: AccountsInput): AccountsState {
  const balances = accountBalances(accounts, flows);
  const investments = investmentTotals(holdings, quotes);
  const cards = accounts.filter((account) => account.kind === "credit");
  const balanceOf = (card: OverviewAccount) => balances.get(card.id)?.balance ?? 0;
  const bills = new Map(cards.map((card) => [card.id, cardBill(card, balanceOf(card), cardFlows, today, cardBills)]));
  const fills = new Map(cards.map((card) => [card.id, billDefaults(card, balanceOf(card), cardFlows, today, cardBills)]));
  return { balances, investments, bills, fills, withHoldings: accountsWithHoldings(holdings), summary: assetSummary(accounts, balances, investments) };
}
