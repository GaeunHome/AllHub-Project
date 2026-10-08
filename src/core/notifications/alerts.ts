import type { NotificationFeed, NotificationItem, UnreadSummary } from "./types";

const ALERTED_KEY = "allhub:notifications:alerted-up-to";

type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** 第一次載入（lastSeenId 是 null）不算新通知：打開網站前就有的不必再響一次 */
export function freshNotifications(recent: NotificationItem[], lastSeenId: number | null): { fresh: NotificationItem[]; lastSeenId: number } {
  const newest = Math.max(lastSeenId ?? 0, ...recent.map((item) => item.id));
  if (lastSeenId === null) return { fresh: [], lastSeenId: newest };
  const fresh = recent.filter((item) => item.id > lastSeenId && !item.read).sort((a, b) => a.id - b.id);
  return { fresh, lastSeenId: newest };
}

/** 開了好幾個分頁時，只有第一個看到的分頁播提示音與跳系統通知；localStorage 不能用時照樣提醒 */
export function claimAlerts(ids: number[], storage: KeyValueStorage | null): number[] {
  if (!storage) return ids;
  try {
    const claimedUpTo = Number(storage.getItem(ALERTED_KEY) ?? 0) || 0;
    const mine = ids.filter((id) => id > claimedUpTo);
    if (mine.length > 0) storage.setItem(ALERTED_KEY, String(Math.max(...mine)));
    return mine;
  } catch {
    return ids;
  }
}

/** 每個模組各自的兩種提醒方式 */
export type AlertKind = "sound" | "browser";

export type AlertPlan = { toasts: NotificationItem[]; sound: boolean; system: NotificationItem[] };

/** 兩種都關的模組只算進未讀數（連提示卡片也不跳）；提示音與系統通知只給這個分頁認領到的通知，多個分頁才只響一次 */
export function planAlerts(fresh: NotificationItem[], claimed: ReadonlySet<number>, isOn: (module: string, kind: AlertKind) => boolean): AlertPlan {
  const mine = fresh.filter((item) => claimed.has(item.id));
  return {
    toasts: fresh.filter((item) => isOn(item.module, "sound") || isOn(item.module, "browser")),
    sound: mine.some((item) => isOn(item.module, "sound")),
    system: mine.filter((item) => isOn(item.module, "browser")),
  };
}

function withRead(feed: NotificationFeed, shouldMark: (item: NotificationItem) => boolean): NotificationFeed {
  const byModule = { ...feed.unread.byModule };
  let total = feed.unread.total;
  const recent = feed.recent.map((item) => {
    if (item.read || !shouldMark(item)) return item;
    total = Math.max(0, total - 1);
    byModule[item.module] = Math.max(0, (byModule[item.module] ?? 0) - 1);
    return { ...item, read: true };
  });
  return { recent, unread: { total, byModule: dropZero(byModule) } };
}

function dropZero(byModule: UnreadSummary["byModule"]): UnreadSummary["byModule"] {
  return Object.fromEntries(Object.entries(byModule).filter(([, count]) => count > 0));
}

/** 按下去先改畫面，不必等伺服器回應；伺服器回來的結果再覆蓋 */
export function applyLocalRead(feed: NotificationFeed, ids: number[]): NotificationFeed {
  const set = new Set(ids);
  return withRead(feed, (item) => set.has(item.id));
}

export function applyLocalReadAll(feed: NotificationFeed, module?: string): NotificationFeed {
  if (!module) return { recent: feed.recent.map((item) => (item.read ? item : { ...item, read: true })), unread: { total: 0, byModule: {} } };
  const { [module]: cleared = 0, ...rest } = feed.unread.byModule;
  const marked = withRead(feed, (item) => item.module === module);
  return { recent: marked.recent, unread: { total: Math.max(0, feed.unread.total - cleared), byModule: dropZero(rest) } };
}
