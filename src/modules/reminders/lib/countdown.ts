import { formatTaipeiMonthDay, taipeiDayOffset } from "@/core/time";

// 資料庫存的是台北的日期字串 core/time.ts 收的是 Date
const taipeiDay = (date: string) => new Date(`${date}T00:00:00+08:00`);

/** 今天起第幾天 今天 0 明天 1 */
export const daysUntil = (date: string, now: Date): number => taipeiDayOffset(taipeiDay(date), now);

/** 卡片與通知共用 */
export function countdownText(days: number): string {
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  return `還有 ${days} 天`;
}

/** 卡片與通知共用 不同年時寫出年份 才不會看錯是哪一年 */
export function formatDate(date: string, today: string): string {
  const monthDay = formatTaipeiMonthDay(taipeiDay(date));
  const year = date.slice(0, 4);
  return year === today.slice(0, 4) ? monthDay : `${year}/${monthDay}`;
}
