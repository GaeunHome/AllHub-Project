import { isRealDateKey } from "@/core/time";

/** 提前幾天開始通知 0 是只有當天 其他的提前那天與當天各寄一則 */
export const NOTIFY_DAYS = [0, 1, 3, 7, 14, 30] as const;

const TITLE_MAX_LENGTH = 30;
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

export type ReminderInput = { title: string; date: string; notify: string };
export type ReminderValues = { title: string; date: string; notifyDaysBefore: number | null };
export type Parsed = { ok: true; value: ReminderValues } | { ok: false; error: string };

const fail = (error: string): Parsed => ({ ok: false, error });

/** 把表單的字串解析成資料表的值 today 是台北的日期 字串比大小就是比先後 */
export function parseReminder({ title: rawTitle, date, notify }: ReminderInput, today: string): Parsed {
  const title = rawTitle.normalize("NFC").replace(/\s+/g, " ").trim();
  if (title === "") return fail("請輸入標題");
  // 用 code point 算字數 emoji 才不會算成兩個字
  if ([...title].length > TITLE_MAX_LENGTH) return fail(`標題最多 ${TITLE_MAX_LENGTH} 個字`);
  if (!isRealDateKey(date)) return fail("請選擇正確的日期");
  if (date < today) return fail("日期不能早於今天");
  if (date > latestDate(today)) return fail(`日期最多到 ${YEARS_AHEAD} 年後`);
  const days = NOTIFY_DAYS.find((value) => String(value) === notify);
  if (days === undefined && notify !== NOTIFY_NONE) return fail("請從清單選擇通知時間");
  return { ok: true, value: { title, date, notifyDaysBefore: days ?? null } };
}
