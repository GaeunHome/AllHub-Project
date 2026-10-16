import { taipeiDateKey } from "@/core/time";
import type { MonthKey } from "./month";

/** 台北時間的 YYYY-MM-DD 字串 跟資料庫的 date 欄位與日期輸入框同一種格式 */
export type DateKey = string;

// 更早的日期多半是打錯 資料庫也有同樣的 check
export const MIN_DATE: DateKey = "2000-01-01";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 伺服器是 UTC 晚上八點後會差一天 所以今天用台北時間算
export function taipeiToday(now: Date): DateKey {
  return taipeiDateKey(now);
}

export function lastDayOfMonth(month: MonthKey): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** 擋掉格式錯 早於 MIN_DATE 以及 2 月 30 日這種不存在的日期 */
export function parseDate(raw: unknown): DateKey | null {
  if (typeof raw !== "string") return null;
  const match = DATE_PATTERN.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > lastDayOfMonth(`${year}-${month}`)) return null;
  return raw >= MIN_DATE ? raw : null;
}

// 日期字串沒有時區 用伺服器或瀏覽器的時區算星期會差一天 所以用 UTC
function weekdayOf(year: number, month: number, day: number): string {
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 月日加上括號裡的星期 */
export function formatDay(date: DateKey): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${month} 月 ${day} 日（${weekdayOf(year, month, day)}）`;
}

/** 跟 reference 不同年時寫出年份 才不會看錯是哪一年 */
export function formatMonthDay(date: DateKey, reference?: DateKey): string {
  const [year, month, day] = date.split("-").map(Number);
  const sameYear = reference === undefined || reference.slice(0, 4) === date.slice(0, 4);
  return `${sameYear ? "" : `${year} 年 `}${month} 月 ${day} 日`;
}

const toUtc = (date: DateKey) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const DAY_MS = 86_400_000;

/** 日期字串加減天數 用 UTC 算才不會碰到時區與日光節約 */
export function addDays(date: DateKey, days: number): DateKey {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** to 比 from 晚幾天 早的話是負的 */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 是星期日 6 是星期六 */
export function weekdayOfDate(date: DateKey): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** 到期與截止的短寫法 例如 10/20 */
export function formatSlashDate(date: DateKey): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

/** overdue 已經過了 today 是今天 upcoming 還沒到 */
export type DueStatus = "overdue" | "today" | "upcoming";

/** 待處理與信用卡帳單共用 同一個日期不會一邊算逾期一邊算今天 */
export function dueStatus(date: DateKey, today: DateKey): DueStatus {
  return date < today ? "overdue" : date === today ? "today" : "upcoming";
}

/** 到期的相對寫法 例如 今天 還有 5 天 逾期 2 天 */
export function dueText(daysLeft: number): string {
  if (daysLeft === 0) return "今天";
  return daysLeft > 0 ? `還有 ${daysLeft} 天` : `逾期 ${-daysLeft} 天`;
}
