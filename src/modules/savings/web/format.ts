import { dueText, formatSlashDate, type DateKey } from "../lib/dates";
import { DIVIDEND_KIND_LABELS, type DividendKind } from "../lib/dividends";
import type { TransactionKind } from "../lib/kinds";
import { formatNumber, formatSignedTwd, formatTwd } from "../lib/money";
import { formatMonth, formatMonthShort, type MonthKey } from "../lib/month";
import { formatPrice } from "../lib/quotes";
import type { RecurringRowView } from "./recurring-view";

// 畫面上的數字與文字寫法 伺服器與瀏覽器共用 client 元件只從這裡拿

/** 標籤加值的一列 交給 FactList 畫 */
export type FactRow = { label: string; value: string };

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
  return percent === null ? formatSignedTwd(profit) : `${formatSignedTwd(profit)} (${formatSignedPercent(percent)})`;
}

export const formatShares = (shares: number) => `${formatNumber(shares)} 股`;

/** 股價存成整數的分 例如 $258.70 */
export const priceText = (closeCents: number) => `$${formatPrice(closeCents)}`;

/** 總成本除以股數 寫法跟收盤價一樣才好比 賣光的沒有均價 */
export function averagePriceText({ shares, cost }: { shares: number; cost: number }): string | null {
  return shares > 0 ? priceText(Math.round((cost * 100) / shares)) : null;
}

/** 固定收支的預計金額與記下的那一筆 只有收入帶加號 */
export function plannedAmount(kind: TransactionKind, amount: number): string {
  return kind === "income" ? formatSignedTwd(amount) : formatTwd(amount);
}

/** 逾期的標籤 一列最多一個標籤 只給要處理的狀態 */
export const overdueBadge = (daysLeft: number) => ({ label: dueText(daysLeft), tone: "danger" as const });

/** 停用的帳戶只在修改舊資料時出現在選單裡 要標出來 */
export const pausedName = (name: string, active: boolean | undefined) => (active === false ? `${name}（已停用）` : name);

/**
 * 固定收支那一列金額下面那幾行 要處理的那一期寫日期與還有幾天 其他寫下一期
 * 逾期的天數在標籤上不重複 停用的不寫
 */
export function recurringNext(row: Pick<RecurringRowView, "nextDate" | "due" | "paused">): string[] {
  if (row.paused !== null) return [];
  if (!row.due) return row.nextDate === null ? [] : [`下一期 ${formatSlashDate(row.nextDate)}`];
  const { date, status, daysLeft, laterCount } = row.due;
  const day = formatSlashDate(date);
  return [status === "today" ? `${day} 今天到期` : `${day} 到期`, ...(status === "upcoming" ? [dueText(daysLeft)] : []), ...(laterCount > 0 ? [`還有 ${laterCount} 期`] : [])];
}

function dividendWhen(daysLeft: number, lastBuyToday: boolean): string {
  if (daysLeft === 0) return "今天";
  // 週一除息時週五就是最後買進日 寫還有幾天會錯過
  if (lastBuyToday) return "今天最後買進";
  return daysLeft === 1 ? "明天" : dueText(daysLeft);
}

/** 除權息那一列名稱下面兩行 第一行是日期與種類 第二行是還有多久 */
export function dividendDateLines({ exDate, kind, daysLeft, lastBuyToday }: { exDate: DateKey; kind: DividendKind; daysLeft: number; lastBuyToday: boolean }): string[] {
  return [`${formatSlashDate(exDate)} ${DIVIDEND_KIND_LABELS[kind]}`, dividendWhen(daysLeft, lastBuyToday)];
}
