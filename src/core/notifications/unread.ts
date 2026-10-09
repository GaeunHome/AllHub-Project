import type { NotificationFeed, NotificationItem } from "./types";

/** 首頁摘要最多列幾則 */
const DIGEST_LIMIT = 3;

/** 從輪詢帶回的最近通知裡挑未讀的；更早的未讀不在最近幾則裡，只算進數量 */
export function unreadDigest(feed: NotificationFeed, limit = DIGEST_LIMIT): { items: NotificationItem[]; more: number } {
  const items = feed.recent.filter((item) => !item.read).slice(0, limit);
  return { items, more: Math.max(0, feed.unread.total - items.length) };
}
