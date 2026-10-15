// 只取數字欄位 分隔符號自己組 語系的空白會隨 ICU 版本改變
// 例如 ICU 78 的 zh-TW 用 U+2009 伺服器與瀏覽器算出來會對不上
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

/** 例如 2026-01-05 判斷是不是台北的同一天或算相差幾天用 */
export function taipeiDateKey(date: Date): string {
  const { year, month, day } = taipeiFields(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const MINUTE_MS = 60_000;

/** 照 YouTube 卡片寫成 3 小時前 時鐘誤差算出未來時當成剛剛 */
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
