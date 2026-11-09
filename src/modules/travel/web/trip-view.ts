import { daysBetweenKeys, formatTaipeiLongDate, formatTaipeiMonthDay, formatTaipeiShortDate } from "@/core/time";
import { deleteDateOf, tripDays } from "../lib/rules";
import type { TripSummary } from "../service/trips";

// 伺服器把日期整理成要顯示的文字 畫面只負責排版

export type DayView = { date: string; label: string; detail: string; short: string };

/** 日期字串當成台北中午 再用 core/time 格式化 不直接用 Intl */
const dateOf = (key: string) => new Date(`${key}T12:00:00+08:00`);

export const shortDate = (key: string) => formatTaipeiMonthDay(dateOf(key));

export const dateRange = (trip: Pick<TripSummary, "startDate" | "endDate">) => (trip.startDate === trip.endDate ? shortDate(trip.startDate) : `${shortDate(trip.startDate)}–${shortDate(trip.endDate)}`);

export function dayViews(trip: Pick<TripSummary, "startDate" | "endDate">): DayView[] {
  return tripDays(trip.startDate, trip.endDate).map((date, index) => ({ date, label: `第 ${index + 1} 天`, detail: formatTaipeiLongDate(dateOf(date)), short: formatTaipeiShortDate(dateOf(date)) }));
}

/** 旅程現在的狀態 結束的寫幾號自動刪除 使用者才不會以為資料一直都在 */
export function tripStatus(trip: Pick<TripSummary, "startDate" | "endDate">, today: string): string {
  if (today < trip.startDate) {
    const days = daysBetweenKeys(today, trip.startDate);
    return days === 1 ? "明天出發" : `還有 ${days} 天出發`;
  }
  if (today <= trip.endDate) return `旅途中，第 ${daysBetweenKeys(trip.startDate, today) + 1} 天`;
  return `已結束，${shortDate(deleteDateOf(trip.endDate))} 之後自動刪除`;
}
