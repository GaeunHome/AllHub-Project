import { lastDayOfMonth, taipeiToday, type DateKey } from "./dates";
import { addMonths, dateToMonth, taipeiMonth, type MonthKey } from "./month";

// 固定收支的排程每天跑一次 漏掉的月份會補上

/** lastPostedMonth 是資料庫存的當月 1 號 createdAt 之前的日期不補記 */
export type RecurringLike = { dayOfMonth: number; lastPostedMonth: string | null; createdAt: Date };

/** 沒有那一天的月份就記在月底 例如 2 月 30 日 */
export function scheduledDate(month: MonthKey, dayOfMonth: number): DateKey {
  return `${month}-${String(Math.min(dayOfMonth, lastDayOfMonth(month))).padStart(2, "0")}`;
}

function firstOpenMonth(rule: RecurringLike): MonthKey {
  return rule.lastPostedMonth === null ? taipeiMonth(rule.createdAt) : addMonths(dateToMonth(rule.lastPostedMonth), 1);
}

/** 建立之前的日期不補記 當月的已經過了就從下個月開始 */
const scheduledOn = (rule: RecurringLike, month: MonthKey): DateKey | null => {
  const date = scheduledDate(month, rule.dayOfMonth);
  return date >= taipeiToday(rule.createdAt) ? date : null;
};

/** 到 today 為止還沒記的月份 由舊到新 最多 limit 個取最新的 */
export function dueMonths(rule: RecurringLike, today: DateKey, limit = 12): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = firstOpenMonth(rule); month <= dateToMonth(today); month = addMonths(month, 1)) {
    const date = scheduledOn(rule, month);
    if (date !== null && date <= today) months.push(month);
  }
  return months.slice(-limit);
}

/** 設定頁的下次日期 有沒補的月份時是最舊那筆 下次排程就會記 */
export function nextRunDate(rule: RecurringLike, today: DateKey): DateKey {
  const [due] = dueMonths(rule, today);
  if (due !== undefined) return scheduledDate(due, rule.dayOfMonth);
  const open = firstOpenMonth(rule);
  let month = open > dateToMonth(today) ? open : dateToMonth(today);
  // 這個月的日期已經過了或在建立之前 就往後一個月找
  for (;;) {
    const date = scheduledOn(rule, month);
    if (date !== null && date > today) return date;
    month = addMonths(month, 1);
  }
}
