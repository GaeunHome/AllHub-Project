import type { DateKey } from "./dates";
import { formatNumber } from "./money";
import type { Quote } from "./quotes";

// 持股的股數與成本存在資料庫 市值用收盤價算 不存
// 股數乘上分可能超過浮點數能精確表示的整數 所以用 bigint 算四捨五入

/** lib 不能 import data 所以自己定義相容的形狀 多的欄位沒關係 */
export type HoldingLike = { id: number; accountId: number; symbol: string; name: string; shares: number; cost: number; sortOrder: number };

/** 沒有報價時市值先用成本 priced 是 false 讓畫面寫股價暫時讀不到 */
export type HoldingValue = {
  holdingId: number;
  shares: number;
  cost: number;
  value: number;
  profit: number;
  profitPercent: number | null;
  priced: boolean;
  closeCents: number | null;
  date: DateKey | null;
};

/** 投資帳戶的合計 priced 是每一檔都有報價 date 是最新的收盤日期 */
export type InvestmentValue = { value: number; cost: number; profit: number; profitPercent: number | null; priced: boolean; date: DateKey | null; holdings: number };

// 編譯目標不支援 bigint 字面值
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

/** a 乘 b 除以 c 四捨五入到整數 c 要是正的 */
function mulDivRound(a: number, b: number, c: number): number {
  const numerator = BigInt(a) * BigInt(b);
  const denominator = BigInt(c);
  // 一半以上進位 負數照絕對值算 才不會 -0.5 變成 0
  const rounded = ((numerator < 0 ? -numerator : numerator) * TWO + denominator) / (denominator * TWO);
  return numerator < 0 ? -Number(rounded) : Number(rounded);
}

/** 四捨五入照絕對值 賺賠一樣多時百分比正負對稱 成本 0 時沒有百分比 */
export function profitPercentOf(profit: number, cost: number): number | null {
  return cost > 0 ? mulDivRound(profit, 1000, cost) / 10 : null;
}

export function valueHolding(holding: HoldingLike, quote?: Quote | null): HoldingValue {
  const closeCents = quote?.closeCents ?? null;
  const value = closeCents === null ? holding.cost : mulDivRound(holding.shares, closeCents, 100);
  const profit = value - holding.cost;
  return {
    holdingId: holding.id,
    shares: holding.shares,
    cost: holding.cost,
    value,
    profit,
    profitPercent: profitPercentOf(profit, holding.cost),
    priced: closeCents !== null,
    closeCents,
    date: closeCents === null ? null : (quote?.date ?? null),
  };
}

/** 有持股的投資帳戶 市值與成本照持股算 不看帳上的餘額 */
export function investmentTotals(holdings: HoldingLike[], quotes: readonly Quote[] | null): Map<number, InvestmentValue> {
  const bySymbol = new Map((quotes ?? []).map((quote) => [quote.symbol, quote]));
  const totals = new Map<number, InvestmentValue>();
  for (const holding of holdings) {
    const valued = valueHolding(holding, bySymbol.get(holding.symbol));
    const total = totals.get(holding.accountId) ?? { value: 0, cost: 0, profit: 0, profitPercent: null, priced: true, date: null, holdings: 0 };
    total.value += valued.value;
    total.cost += valued.cost;
    total.profit = total.value - total.cost;
    total.profitPercent = profitPercentOf(total.profit, total.cost);
    total.priced &&= valued.priced;
    if (valued.date !== null && (total.date === null || valued.date > total.date)) total.date = valued.date;
    total.holdings += 1;
    totals.set(holding.accountId, total);
  }
  return totals;
}

/** 照平均成本 全部賣完就是全部成本 分次賣完也剛好扣光 */
export function removedCost(holding: Pick<HoldingLike, "shares" | "cost">, sold: number): number {
  if (sold >= holding.shares) return holding.cost;
  return mulDivRound(holding.cost, sold, holding.shares);
}

/**
 * 手續費含在約定金額裡 股數無條件捨去 成本是價金四捨五入加手續費
 * 估不出來時是 null 欄位留空讓使用者照券商的成交回報填
 */
export function estimateRegularBuy(amount: number, closeCents: number | null, fee = 1): { shares: number; cost: number } | null {
  if (closeCents === null || closeCents <= 0 || amount <= fee) return null;
  const shares = Number((BigInt(amount - fee) * HUNDRED) / BigInt(closeCents));
  return shares > 0 ? { shares, cost: mulDivRound(shares, closeCents, 100) + fee } : null;
}

/** 市值照持股算的投資帳戶 一般轉帳轉進轉出都不會算進總資產 0 股也算 */
export function accountsWithHoldings(holdings: readonly Pick<HoldingLike, "accountId">[]): Set<number> {
  return new Set(holdings.map((holding) => holding.accountId));
}

/** 買賣紀錄沒填備註時的寫法 紀錄頁認得出沒改過的預設備註 */
export function tradeNote(side: "buy" | "sell", symbol: string, shares: number): string {
  return `${side === "buy" ? "買進" : "賣出"} ${symbol} ${formatNumber(shares)} 股`;
}
