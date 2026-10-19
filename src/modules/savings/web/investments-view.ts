import { latestOf, type DateKey } from "../lib/dates";
import { profitPercentOf, type HoldingLike } from "../lib/holdings";
import { accountStartDate, bySortOrder, type AccountMonthFlow } from "../lib/ledger";
import type { PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import type { AccountDraft } from "./components/forms/account-form";
import { accountDetails, accountDraft, accountUsage, accountsState, settlementAccounts, type AccountsInput, type InvestmentDetail, type OverviewAccount } from "./dashboard-view";
import type { AccountUsage } from "./settings-display";

// 投資頁 伺服器整理好畫面要的形狀 數字跟總覽同一套算法

/**
 * 一個證券帳戶 數字跟總資產同一套算法
 * startDate 是買賣日期的下限 usage 是刪除前要說的
 */
export type BrokerageView = InvestmentDetail & {
  label: string | null;
  startDate: DateKey;
  usage: AccountUsage;
  draft: AccountDraft;
  isFirst: boolean;
  isLast: boolean;
};

/** 啟用中的證券帳戶合計 quoteDate 是最新的收盤日 沒有持股時是 null */
export type InvestmentSummary = { value: number; cost: number; profit: number; profitPercent: number | null; priced: boolean; quoteDate: DateKey | null; accounts: number };

/** 停用的證券帳戶在帳戶頁的已停用裡 這裡只說有幾個 */
export type InvestmentsView = { summary: InvestmentSummary; brokerages: BrokerageView[]; pausedCount: number };

export type InvestmentsSources = {
  accounts: (OverviewAccount & { label: string | null })[];
  flows: AccountMonthFlow[];
  holdings: HoldingLike[];
  /** 沒有持股時不查 讀不到也是 null */
  quotes: readonly Quote[] | null;
  /** 定期定額的扣款帳戶是買賣的預設 刪除帳戶時固定收支也會一起刪 */
  rules: Pick<PendingRuleRow, "accountId" | "counterAccountId" | "holdingId">[];
  today: DateKey;
};

/** 刪除證券帳戶時持股也會一起刪 確認時要說有幾檔 */
const usageOf = (id: number, { flows, holdings, rules }: Pick<InvestmentsSources, "flows" | "holdings" | "rules">): AccountUsage => ({
  ...accountUsage(id, rules, flows),
  holdingCount: holdings.filter((holding) => holding.accountId === id).length,
});

export function investmentsView(sources: InvestmentsSources): InvestmentsView {
  const { accounts, flows, holdings, quotes, rules, today } = sources;
  const brokerageAccounts = accounts.filter((account) => account.kind === "investment").sort(bySortOrder);
  const input: AccountsInput = { accounts: brokerageAccounts, flows, holdings, quotes, cardFlows: [], cardBills: [], today };
  const state = accountsState(input);
  const details = accountDetails(input, state, settlementAccounts(rules)).filter((detail): detail is InvestmentDetail => detail.kind === "investment");
  const byId = new Map(brokerageAccounts.map((account) => [account.id, account]));
  // 上移下移只在啟用中的證券帳戶之間換
  const brokerages = details.flatMap((detail, index): BrokerageView[] => {
    const account = byId.get(detail.id);
    if (!account) return [];
    return [
      {
        ...detail,
        label: account.label,
        startDate: accountStartDate(account),
        usage: usageOf(account.id, sources),
        draft: accountDraft(account),
        isFirst: index === 0,
        isLast: index === details.length - 1,
      },
    ];
  });

  const { value, cost, profit } = state.summary.investment;
  const holdingAccounts = brokerages.filter((brokerage) => brokerage.holdings.length > 0);
  return {
    summary: {
      value,
      cost,
      profit,
      profitPercent: profitPercentOf(profit, cost),
      priced: holdingAccounts.every((brokerage) => brokerage.priced),
      quoteDate: latestOf(holdingAccounts.map((brokerage) => brokerage.quoteDate)),
      accounts: brokerages.length,
    },
    brokerages,
    pausedCount: brokerageAccounts.filter((account) => !account.active).length,
  };
}
