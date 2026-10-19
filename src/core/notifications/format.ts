import { formatRelativeTime } from "../time";

/** 只在瀏覽器裡用 伺服器算繪時的現在時間跟瀏覽器不同 通知只留兩週 最多寫到幾天前 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  return formatRelativeTime(new Date(iso), now, { largestUnit: "day" });
}
