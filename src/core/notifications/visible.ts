import type { NotificationFeed } from "./types";

/** 關掉的模組看不到 舊通知留在資料庫 恢復後照常顯示 所以讀的時候才濾掉 */
export function withoutModules(feed: NotificationFeed, hidden: ReadonlySet<string>): NotificationFeed {
  if (hidden.size === 0) return feed;
  const byModule = Object.fromEntries(Object.entries(feed.unread.byModule).filter(([id]) => !hidden.has(id)));
  return {
    unread: { total: Object.values(byModule).reduce((sum, count) => sum + count, 0), byModule },
    recent: feed.recent.filter((item) => !hidden.has(item.module)),
  };
}
