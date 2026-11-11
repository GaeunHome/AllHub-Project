import type { AnnouncementKind, CoreAnnouncement } from "../db/schema";
import { announcementWhen, importantFirst, inTicker } from "./rules";

// 全站最上面的跑馬燈 使用者要的 最重要的與站長置頂的公告 可以關掉

export type TickerItem = { key: string; kind: AnnouncementKind; title: string; when: string };

export const TICKER_KEY = "allhub:announcements:ticker";

/** 一秒走 60px 太短的也要 12 秒一輪 字才讀得完 */
const PX_PER_SECOND = 60;
const MIN_SECONDS = 12;

/** 使用者要的 不管長短都一直跑 width 是一份清單的寬度 */
export const tickerSeconds = (width: number): number => Math.max(MIN_SECONDS, width / PX_PER_SECOND);
export const TICKER_HIDDEN_ATTRIBUTE = "data-ticker-hidden";

/** key 帶修改時間 站長改過的算新的一則 關掉後會再出現 */
export function tickerItems(rows: readonly CoreAnnouncement[], now: Date): TickerItem[] {
  return importantFirst(rows.filter((row) => inTicker(row, now))).map((row) => ({ key: `${row.id}:${row.updatedAt.getTime()}`, kind: row.kind, title: row.title, when: announcementWhen(row) }));
}

/** 存的是關掉當下每一則的 key 現在的每一則都關過才不出現 */
export function isTickerDismissed(stored: string | null, keys: readonly string[]): boolean {
  const dismissed = new Set((stored ?? "").split(",").filter(Boolean));
  return keys.every((key) => dismissed.has(key));
}

/** 整頁載入時第一次繪製前跑 判斷跟 isTickerDismissed 一樣 */
export const tickerScript = (keys: readonly string[]): string =>
  `(function(){try{var d=(localStorage.getItem(${JSON.stringify(TICKER_KEY)})||"").split(","),k=${JSON.stringify(keys)};if(k.every(function(x){return d.indexOf(x)>=0}))document.documentElement.setAttribute(${JSON.stringify(TICKER_HIDDEN_ATTRIBUTE)},"")}catch(e){}})()`;
