import { accountStartDate, type AccountLike, type AccountMonthFlow } from "./ledger";
import { dateToMonth, recentMonths, type MonthKey } from "./month";

// 資產走勢 使用者選的回推加每月記一筆
// 存款一律照紀錄回推 事後補記的也算得進去 投資有排程記下的市值就用市值 沒有的用帳上的成本

/** 排程記下的那個月的投資市值 */
export type AssetSnapshot = { month: MonthKey; investment: number };

/** atCost 是這個月的投資照帳上的成本算 沒有記到市值 */
export type AssetTrendPoint = { month: MonthKey; deposit: number; investment: number; total: number; atCost: boolean };

export type AssetTrendInput = {
  accounts: readonly AccountLike[];
  flows: readonly AccountMonthFlow[];
  snapshots: readonly AssetSnapshot[];
  /** 台北時間的這個月 用 live 現在的數字 */
  current: MonthKey;
  live: { deposit: number; investment: number };
};

const netOf = (flow: AccountMonthFlow) => flow.income - flow.expense - flow.transferOut + flow.transferIn + flow.adjust;

/** 跟總資產一樣 只算啟用中的存款與投資 */
const counted = (account: AccountLike) => account.active && account.kind !== "credit";

/** 某個月底的帳上餘額 帳戶建立前的月份不算 */
function ledgerAt(accounts: readonly AccountLike[], flows: readonly AccountMonthFlow[], month: MonthKey) {
  const totals = { deposit: 0, investment: 0, investing: false };
  for (const account of accounts) {
    if (dateToMonth(accountStartDate(account)) > month) continue;
    const balance = account.openingBalance + flows.filter((flow) => flow.accountId === account.id && flow.month <= month).reduce((sum, flow) => sum + netOf(flow), 0);
    if (account.kind === "deposit") totals.deposit += balance;
    else {
      totals.investment += balance;
      totals.investing = true;
    }
  }
  return totals;
}

/** 最多 count 個月 從最早的帳戶那個月開始 剛開始用時不畫一排空的月份 */
export function assetTrend({ accounts, flows, snapshots, current, live }: AssetTrendInput, count = 12): AssetTrendPoint[] {
  const included = accounts.filter(counted);
  if (included.length === 0) return [];
  const earliest = included.map((account) => dateToMonth(accountStartDate(account))).reduce((a, b) => (b < a ? b : a));
  const ownFlows = flows.filter((flow) => included.some((account) => account.id === flow.accountId));
  const recorded = new Map(snapshots.map((snapshot) => [snapshot.month, snapshot.investment]));
  return recentMonths(current, count)
    .filter((month) => month >= earliest)
    .map((month) => {
      if (month === current) return { month, ...live, total: live.deposit + live.investment, atCost: false };
      const ledger = ledgerAt(included, ownFlows, month);
      const snapshot = recorded.get(month);
      const investment = snapshot ?? ledger.investment;
      return { month, deposit: ledger.deposit, investment, total: ledger.deposit + investment, atCost: snapshot === undefined && ledger.investing };
    });
}
