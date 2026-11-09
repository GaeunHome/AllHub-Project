import { addDays, earliestOf, type DateKey } from "./dates";
import { accountBalances, accountStartDate, type AccountDayFlow, type AccountLike, type AccountMonthFlow } from "./ledger";

// 資產走勢 使用者選的近 30 天每天記一筆
// 存款照紀錄從今天往回扣 事後補記的也算得進去 投資有排程記下的市值就用市值 沒有的用帳上的成本

/** 畫幾天 排程也只留這麼多天 */
export const TREND_DAYS = 30;

/** 排程記下的那天的投資市值 */
export type AssetSnapshot = { day: DateKey; investment: number };

/** atCost 是那天的投資照帳上的成本算 沒有記到市值 */
export type AssetTrendPoint = { day: DateKey; deposit: number; investment: number; total: number; atCost: boolean };

export type AssetTrendInput = {
  accounts: readonly AccountLike[];
  /** 每個月的流量 算出現在的帳上餘額 */
  flows: readonly AccountMonthFlow[];
  /** trendStart 起每天的流量 從現在的餘額往回扣 */
  days: readonly AccountDayFlow[];
  snapshots: readonly AssetSnapshot[];
  /** 台北時間的今天 用 live 現在的數字 */
  today: DateKey;
  live: { deposit: number; investment: number };
};

/** 圖的第一天 頁面讀每天的流量也從這天起 */
export const trendStart = (today: DateKey): DateKey => addDays(today, 1 - TREND_DAYS);

const netOf = (flow: AccountDayFlow) => flow.income - flow.expense - flow.transferOut + flow.transferIn + flow.adjust;

/** 跟總資產一樣 只算啟用中的存款與投資 */
const counted = (account: AccountLike) => account.active && account.kind !== "credit";

/** 某天結束時的帳上餘額 帳戶建立前的日子不算 */
function ledgerAt(accounts: readonly AccountLike[], balances: ReadonlyMap<number, number>, days: readonly AccountDayFlow[], day: DateKey) {
  const totals = { deposit: 0, investment: 0, investing: false };
  for (const account of accounts) {
    if (accountStartDate(account) > day) continue;
    const later = days.filter((flow) => flow.accountId === account.id && flow.date > day).reduce((sum, flow) => sum + netOf(flow), 0);
    const balance = (balances.get(account.id) ?? 0) - later;
    if (account.kind === "deposit") totals.deposit += balance;
    else {
      totals.investment += balance;
      totals.investing = true;
    }
  }
  return totals;
}

/** 最多 TREND_DAYS 天 從最早的帳戶那天開始 剛開始用時不畫一排空的日子 */
export function assetTrend({ accounts, flows, days, snapshots, today, live }: AssetTrendInput): AssetTrendPoint[] {
  const included = accounts.filter(counted);
  const earliest = earliestOf(included.map(accountStartDate));
  if (earliest === null) return [];
  const balances = new Map([...accountBalances(included, flows)].map(([id, { balance }]) => [id, balance]));
  const recorded = new Map(snapshots.map((snapshot) => [snapshot.day, snapshot.investment]));
  return Array.from({ length: TREND_DAYS }, (_, i) => addDays(trendStart(today), i))
    .filter((day) => day >= earliest)
    .map((day) => {
      if (day === today) return { day, ...live, total: live.deposit + live.investment, atCost: false };
      const ledger = ledgerAt(included, balances, days, day);
      const snapshot = recorded.get(day);
      const investment = snapshot ?? ledger.investment;
      return { day, deposit: ledger.deposit, investment, total: ledger.deposit + investment, atCost: snapshot === undefined && ledger.investing };
    });
}
