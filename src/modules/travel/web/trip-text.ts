import { mapsSearchUrl } from "../lib/maps";
import type { ItemKind } from "../lib/rules";
import { formatClock, scheduleDay } from "../lib/schedule";
import type { TripItem, TripSummary } from "../service/trips";
import { itemsOfDay } from "./board-model";
import { dateRange, type DayView } from "./trip-view";

// 貼到 LINE 給沒有帳號的親友看 備註可能有訂位代號這類私人內容 不帶出去

type TextTrip = Pick<TripSummary, "title" | "destination" | "startDate" | "endDate">;

/** 交通與其他常常不是地點 例如搭電車 拿名稱查地圖沒有意義 */
const SEARCHABLE: readonly ItemKind[] = ["place", "food", "stay"];

const linkOf = (item: TripItem, destination: string | null) => item.mapsUrl ?? (SEARCHABLE.includes(item.kind) ? mapsSearchUrl(item.title, destination) : null);

function stopLines(destination: string | null, date: string, items: readonly TripItem[]): string[] {
  const list = itemsOfDay(items, date);
  if (list.length === 0) return ["還沒排行程"];
  const schedule = scheduleDay(list);
  return list.flatMap((item, index) => {
    const link = linkOf(item, destination);
    return [`${formatClock(schedule[index].arrive)} ${item.title}`, ...(link ? [link] : [])];
  });
}

export function dayText(trip: Pick<TextTrip, "title" | "destination">, day: DayView, items: readonly TripItem[]): string {
  return [`${trip.title} ${day.label} ${day.short}`, ...stopLines(trip.destination, day.date, items)].join("\n");
}

export function tripText(trip: TextTrip, days: readonly DayView[], items: readonly TripItem[]): string {
  const sections = days.map((day) => [`${day.label} ${day.short}`, ...stopLines(trip.destination, day.date, items)].join("\n"));
  return [`${trip.title} ${dateRange(trip)}`, ...sections].join("\n\n");
}
