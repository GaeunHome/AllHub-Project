import { taipeiDateKey } from "@/core/time";

/** 月份一律用 YYYY-MM 字串（例如 2026-10），跟網址參數與 <input type="month"> 的格式一樣 */
export type MonthKey = string;

// 更早的月份多半是打錯，順便讓日期運算不用處理不到四位數的年份
export const MIN_MONTH: MonthKey = "2000-01";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// 「本月」要以台北時間為準，伺服器（Vercel）是 UTC，月底晚上 8 點後就會差一個月
export function taipeiMonth(date: Date): MonthKey {
  return dateToMonth(taipeiDateKey(date));
}

export function parseMonth(raw: unknown): MonthKey | null {
  return typeof raw === "string" && MONTH_PATTERN.test(raw) && raw >= MIN_MONTH ? raw : null;
}

function toIndex(month: MonthKey): number {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m - 1;
}

function fromIndex(index: number): MonthKey {
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  return fromIndex(toIndex(month) + delta);
}

export function recentMonths(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

export function monthToDate(month: MonthKey): string {
  return `${month}-01`;
}

export function dateToMonth(date: string): MonthKey {
  return date.slice(0, 7);
}

export function resolveMonth(raw: string | string[] | undefined, current: MonthKey): MonthKey {
  const month = parseMonth(Array.isArray(raw) ? raw[0] : raw);
  return month !== null && month <= current ? month : current;
}

export function selectableMonths(current: MonthKey, earliest: MonthKey | null, selected: MonthKey): MonthKey[] {
  const oldest = [addMonths(current, -11), selected, earliest ?? current].reduce((a, b) => (b < a ? b : a));
  return Array.from({ length: toIndex(current) - toIndex(oldest) + 1 }, (_, i) => addMonths(current, -i));
}

export function formatMonth(month: MonthKey): string {
  const [year, m] = month.split("-").map(Number);
  return `${year} 年 ${m} 月`;
}

export function formatMonthShort(month: MonthKey): string {
  return `${Number(month.slice(5, 7))} 月`;
}
