import { taipeiDateKey } from "@/core/time";
import { countdownText, daysUntil, formatDate } from "../lib/countdown";
import { latestDate, nextOccurrence } from "../lib/rules";
import type { ReminderItem } from "../service/items";

// 伺服器把清單整理成要顯示的文字 卡片只負責排版

/** 直接顯示幾個 其他的收起來 */
const SHOWN_COUNT = 5;

/** date 是下一次的日期 */
export type ReminderRowView = ReminderItem & { dateText: string; countdown: string; days: number };

/** 日期欄位能選的範圍 */
export type DateLimits = { today: string; latest: string };

export type RemindersView = DateLimits & { shown: ReminderRowView[]; more: ReminderRowView[] };

function rowView(item: ReminderItem, today: string, now: Date): ReminderRowView {
  const days = daysUntil(item.date, now);
  return { ...item, dateText: formatDate(item.date, today), countdown: countdownText(days), days };
}

/** items 是快取裡的全部項目 過期的在這裡濾掉 排程還沒跑也不顯示 當天還在 隔天才消失 重複的照下一次排 */
export function remindersView(items: readonly ReminderItem[], now: Date): RemindersView {
  const today = taipeiDateKey(now);
  const rows = items
    .flatMap((item) => {
      const date = nextOccurrence(item, today);
      return date === null ? [] : [rowView({ ...item, date }, today, now)];
    })
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return { today, latest: latestDate(today), shown: rows.slice(0, SHOWN_COUNT), more: rows.slice(SHOWN_COUNT) };
}
