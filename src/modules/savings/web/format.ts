import { dueText, formatSlashDate } from "../lib/dates";
import type { TransactionKind } from "../lib/kinds";
import { formatNumber, formatSignedTwd, formatTwd } from "../lib/money";
import { formatMonth, formatMonthShort, type MonthKey } from "../lib/month";
import { formatPrice } from "../lib/quotes";
import type { RecurringRowView } from "./recurring-view";

// 畫面上的數字與文字寫法 伺服器與瀏覽器共用 client 元件只從這裡拿

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
 * 固定收支那一列名稱下面那一行 要處理的那一期寫日期與還有幾天 逾期改用標籤不在這裡重複
 * 停用的不寫下一期 extra 是排程後面多寫的 例如從哪個帳戶扣
 */
export function recurringDetail(row: Pick<RecurringRowView, "nextDate" | "due" | "paused">, schedule: string, extra: string[] = []): string {
  const parts = [schedule, ...extra];
  if (row.paused !== null) return parts.join(" · ");
  if (row.due) {
    parts.push(row.due.status === "overdue" ? formatSlashDate(row.due.date) : `${formatSlashDate(row.due.date)} ${row.due.status === "today" ? "今天到期" : `到期 · ${dueText(row.due.daysLeft)}`}`);
    if (row.due.laterCount > 0) parts.push(`還有 ${row.due.laterCount} 期`);
  } else if (row.nextDate !== null) {
    parts.push(`下一期 ${formatSlashDate(row.nextDate)}`);
  }
  return parts.join(" · ");
}
