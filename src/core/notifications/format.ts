import { formatTaipeiDateTime } from "../time";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 只在瀏覽器裡用（鈴鐺面板、提示卡片）：伺服器算繪時用的現在時間跟瀏覽器不同 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return "剛剛";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} 分鐘前`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} 小時前`;
  return `${Math.floor(elapsed / DAY_MS)} 天前`;
}

// 固定台北時間：通知頁在伺服器先算繪，瀏覽器再接手，時區不同的話時間會對不上
export function absoluteTime(iso: string): string {
  return formatTaipeiDateTime(new Date(iso));
}
