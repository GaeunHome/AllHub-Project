// 只取數字欄位 分隔符號自己組 語系的空白會隨 ICU 版本變
// 伺服器與瀏覽器的 ICU 不同時才不會對不上
const taipeiFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function taipeiFields(date: Date) {
  const parts = taipeiFormat.formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: field("year"), month: field("month"), day: field("day"), hour: field("hour"), minute: field("minute"), second: field("second") };
}

// 補零也自己做 不依賴 ICU 對 2-digit 的處理
const pad2 = (value: number) => String(value).padStart(2, "0");

/** 例如 2026/1/5 09:02 月日不補零 時分補零 */
export function formatTaipeiDateTime(date: Date): string {
  const { year, month, day, hour, minute } = taipeiFields(date);
  return `${year}/${month}/${day} ${pad2(hour)}:${pad2(minute)}`;
}

/** 例如 1/5 */
export function formatTaipeiMonthDay(date: Date): string {
  const { month, day } = taipeiFields(date);
  return `${month}/${day}`;
}

/** 24 小時制 例如 09:02 */
export function formatTaipeiHourMinute(date: Date): string {
  const { hour, minute } = taipeiFields(date);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 導覽列時鐘用 24 小時制 例如 09:02:05 */
export function formatTaipeiHourMinuteSecond(date: Date): string {
  const { hour, minute, second } = taipeiFields(date);
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

const WEEKDAYS = "日一二三四五六";

/** 星期用台北的日期算 不用伺服器的時區 */
const weekdayOf = (year: number, month: number, day: number) => WEEKDAYS[weekdayOfKey(dateKeyOf(year, month, day))];

/** 首頁的日期 例如 11 月 4 日 星期三 */
export function formatTaipeiLongDate(date: Date): string {
  const { year, month, day } = taipeiFields(date);
  return `${month} 月 ${day} 日 星期${weekdayOf(year, month, day)}`;
}

/** 位置不夠時的日期 例如 11/4 加星期 */
export function formatTaipeiShortDate(date: Date): string {
  const { year, month, day } = taipeiFields(date);
  return `${month}/${day}（${weekdayOf(year, month, day)}）`;
}

/** 例如 2026-01-05 判斷是不是台北的同一天或算相差幾天用 */
export function taipeiDateKey(date: Date): string {
  const { year, month, day } = taipeiFields(date);
  return dateKeyOf(year, month, day);
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD 當成 UTC 的午夜 只用來算日曆 不看時區 */
const utcMsOf = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** YYYY-MM-DD 而且日曆上有這一天 2 月 30 日這種日期 Date 會自己進位或變成無效 換回字串對不上 */
export function isRealDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(utcMsOf(value));
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** 例如 2026-01 伺服器是 UTC 月底晚上八點後會差一個月 所以照台北的日期取 */
export function taipeiMonthKey(date: Date): string {
  return taipeiDateKey(date).slice(0, 7);
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** date 是台北日曆上 now 之後的第幾天 今天 0 明天 1 昨天 -1 不看幾點 */
export function taipeiDayOffset(date: Date, now: Date): number {
  return daysBetweenKeys(taipeiDateKey(now), taipeiDateKey(date));
}

/** 日期字串往後幾天 負數往前 跨月跨年與閏年照日曆 */
export function addDaysToKey(key: string, days: number): string {
  return new Date(utcMsOf(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** to 是 from 之後的第幾天 同一天 0 to 比較早時是負的 */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((utcMsOf(to) - utcMsOf(from)) / DAY_MS);
}

/** 0 是星期日 照日期字串本身 不是伺服器的時區 */
export function weekdayOfKey(key: string): number {
  return new Date(utcMsOf(key)).getUTCDay();
}

/** 月日補零 那個月沒有這一天時算月底 例如每月 31 號的提醒在 4 月是 30 號 */
export function dateKeyOf(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(day, lastDay))}`;
}

/**
 * 照 YouTube 卡片寫成 3 小時前 時鐘誤差算出未來時當成剛剛
 * largestUnit 是最大的單位 通知只寫到幾天前
 */
export function formatRelativeTime(date: Date, now: Date, { largestUnit = "year" }: { largestUnit?: "day" | "year" } = {}): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / MINUTE_MS);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7 || largestUnit === "day") return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  if (days < 365) return `${Math.min(11, Math.floor(days / 30))} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}
