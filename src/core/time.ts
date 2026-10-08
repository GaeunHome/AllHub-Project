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
