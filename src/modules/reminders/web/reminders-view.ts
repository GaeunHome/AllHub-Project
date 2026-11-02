import { taipeiDateKey } from "@/core/time";
import { countdownText, daysUntil, formatDate } from "../lib/countdown";
import { latestDate } from "../lib/rules";
import type { ReminderItem } from "../service/items";

// 伺服器把清單整理成要顯示的文字 卡片只負責排版

/** 直接顯示幾個 其他的收起來 */
const SHOWN_COUNT = 5;

export type ReminderRowView = ReminderItem & { dateText: string; countdown: string; isToday: boolean };

/** 日期欄位能選的範圍 */
export type DateLimits = { today: string; latest: string };

export type RemindersView = DateLimits & { shown: ReminderRowView[]; more: ReminderRowView[] };

function rowView(item: ReminderItem, today: string, now: Date): ReminderRowView {
  const days = daysUntil(item.date, now);
  return { ...item, dateText: formatDate(item.date, today), countdown: countdownText(days), isToday: days === 0 };
}

/** items 是快取裡照日期排好的全部項目 過期的在這裡濾掉 排程還沒跑也不顯示 當天還在 隔天才消失 */
export function remindersView(items: readonly ReminderItem[], now: Date): RemindersView {
  const today = taipeiDateKey(now);
  const rows = items.filter((item) => item.date >= today).map((item) => rowView(item, today, now));
  return { today, latest: latestDate(today), shown: rows.slice(0, SHOWN_COUNT), more: rows.slice(SHOWN_COUNT) };
}
