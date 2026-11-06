import { isRealDateKey } from "@/core/time";

/** 提前幾天開始通知 0 是只有當天 其他的提前那天與當天各寄一則 */
export const NOTIFY_DAYS = [0, 1, 3, 7, 14, 30] as const;

const TITLE_MAX_LENGTH = 30;
/** 使用者要的 每月與每年 例如生日與繳費 */
export const REMINDER_REPEATS = ["none", "monthly", "yearly"] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

/** 每人最多幾個還沒過期的提醒 */
export const ITEM_LIMIT = 50;
/** 日期最多到今天起幾年 */
const YEARS_AHEAD = 10;

const NOTIFY_NONE = "none";
/** 新增時預設當天 */
export const DEFAULT_NOTIFY = "0";

/** 下拉選單的選項 value 是表單送出的字串 */
export const NOTIFY_OPTIONS = [{ value: NOTIFY_NONE, label: "不通知" }, ...NOTIFY_DAYS.map((days) => ({ value: String(days), label: days === 0 ? "當天" : `前 ${days} 天` }))];

/** 資料表的值換成下拉選單的值 */
export const notifyValueOf = (notifyDaysBefore: number | null): string => (notifyDaysBefore === null ? NOTIFY_NONE : String(notifyDaysBefore));

/** 今天起 10 年後的同一天 閏日十年後不一定有那一天 */
export function latestDate(today: string): string {
  const year = Number(today.slice(0, 4)) + YEARS_AHEAD;
  const sameDay = `${year}${today.slice(4)}`;
  return isRealDateKey(sameDay) ? sameDay : `${year}-02-28`;
}

export const REPEAT_OPTIONS: { value: ReminderRepeat; label: string }[] = [
  { value: "none", label: "不重複" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

export type ReminderInput = { title: string; date: string; notify: string; repeat?: string };
export type ReminderValues = { title: string; date: string; notifyDaysBefore: number | null; repeat: ReminderRepeat };
export type Parsed = { ok: true; value: ReminderValues } | { ok: false; error: string };

const fail = (error: string): Parsed => ({ ok: false, error });

/** 把表單的字串解析成資料表的值 today 是台北的日期 字串比大小就是比先後 */
export function parseReminder({ title: rawTitle, date, notify, repeat: rawRepeat }: ReminderInput, today: string): Parsed {
  const title = rawTitle.normalize("NFC").replace(/\s+/g, " ").trim();
  if (title === "") return fail("請輸入標題");
  // 用 code point 算字數 emoji 才不會算成兩個字
  if ([...title].length > TITLE_MAX_LENGTH) return fail(`標題最多 ${TITLE_MAX_LENGTH} 個字`);
  if (!isRealDateKey(date)) return fail("請選擇正確的日期");
  if (date < today) return fail("日期不能早於今天");
  if (date > latestDate(today)) return fail(`日期最多到 ${YEARS_AHEAD} 年後`);
  const days = NOTIFY_DAYS.find((value) => String(value) === notify);
  if (days === undefined && notify !== NOTIFY_NONE) return fail("請從清單選擇通知時間");
  const repeat = REMINDER_REPEATS.find((value) => value === (rawRepeat || "none"));
  if (repeat === undefined) return fail("請從清單選擇重複的方式");
  return { ok: true, value: { title, date, notifyDaysBefore: days ?? null, repeat } };
}

const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** 沒有那一天的月份算月底 */
function onDay(year: number, month: number, day: number): string {
  const shown = Math.min(day, lastDayOf(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(shown).padStart(2, "0")}`;
}

/** 下一次的日期 今天也算 不重複的過了回 null 重複的 date 是第一次 每次都從它算 31 號才不會變成 30 號 */
export function nextOccurrence({ date, repeat }: { date: string; repeat: ReminderRepeat }, today: string): string | null {
  if (date >= today) return date;
  if (repeat === "none") return null;
  const [, firstMonth, day] = date.split("-").map(Number);
  const [year, month] = today.split("-").map(Number);
  if (repeat === "yearly") {
    const thisYear = onDay(year, firstMonth, day);
    return thisYear >= today ? thisYear : onDay(year + 1, firstMonth, day);
  }
  const thisMonth = onDay(year, month, day);
  if (thisMonth >= today) return thisMonth;
  return month === 12 ? onDay(year + 1, 1, day) : onDay(year, month + 1, day);
}
