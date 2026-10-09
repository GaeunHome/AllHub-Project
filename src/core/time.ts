// 只取數字欄位、分隔符號自己組：語系產生的 literal 與空白會隨 ICU 版本改變（ICU 78 的 zh-TW 日期與時間之間是 U+2009），伺服器與瀏覽器算出來會對不上
const taipeiFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

function taipeiFields(date: Date) {
  const parts = taipeiFormat.formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: field("year"), month: field("month"), day: field("day"), hour: field("hour"), minute: field("minute") };
}

// 補零也自己做，不依賴 ICU 對 numeric／2-digit 的處理
const pad2 = (value: number) => String(value).padStart(2, "0");

/** 例如 2026/1/5 09:02（月日不補零、時分補零） */
export function formatTaipeiDateTime(date: Date): string {
  const { year, month, day, hour, minute } = taipeiFields(date);
  return `${year}/${month}/${day} ${pad2(hour)}:${pad2(minute)}`;
}

/** 例如 1/5 */
export function formatTaipeiMonthDay(date: Date): string {
  const { month, day } = taipeiFields(date);
  return `${month}/${day}`;
}

/** 例如 09:02（24 小時制） */
export function formatTaipeiHourMinute(date: Date): string {
  const { hour, minute } = taipeiFields(date);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 例如 2026-01-05：判斷是不是台北的同一天、算相差幾天用 */
export function taipeiDateKey(date: Date): string {
  const { year, month, day } = taipeiFields(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const MINUTE_MS = 60_000;

/** 例如「3 小時前」（YouTube 卡片的寫法）；時間在未來（時鐘誤差）時當成剛剛 */
export function formatRelativeTime(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / MINUTE_MS);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  if (days < 365) return `${Math.min(11, Math.floor(days / 30))} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}
