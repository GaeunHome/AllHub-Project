import { daysBetween, type DateKey } from "../lib/dates";
import { heldDividends, lastBuyDate, type DividendEvent, type DividendKind, type HeldShares } from "../lib/dividends";

// 投資頁的除權息卡片 估計金額跟排程寄的通知同一套算法

/** 金額還沒公布或只有除權時 cashPerShare 與 estimate 是 null */
export type DividendRowView = { symbol: string; name: string; exDate: DateKey; kind: DividendKind; daysLeft: number; lastBuyToday: boolean; cashPerShare: string | null; estimate: number | null };

/** 預告表讀不到時只說稍後再看 */
export type DividendsView = { status: "unavailable" } | { status: "ready"; rows: DividendRowView[] };

/** 沒有持股 或持股都還沒有要除權息時是 null 卡片整個不顯示 */
export function dividendsView(held: readonly HeldShares[], events: readonly DividendEvent[] | null, today: DateKey): DividendsView | null {
  if (held.length === 0) return null;
  if (events === null) return { status: "unavailable" };
  const rows = heldDividends(events, held, today).map(({ symbol, name, event, estimate }) => ({
    symbol,
    name,
    exDate: event.exDate,
    kind: event.kind,
    daysLeft: daysBetween(today, event.exDate),
    lastBuyToday: lastBuyDate(event.exDate) === today,
    cashPerShare: event.cashPerShare,
    estimate,
  }));
  return rows.length > 0 ? { status: "ready", rows } : null;
}
