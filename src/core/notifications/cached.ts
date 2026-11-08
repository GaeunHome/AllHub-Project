import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notificationsTag } from "./cache-tags";
import { listNotifications, loadFeed, notificationCounts } from "./service";
import type { NotificationFeed, NotificationItem } from "./types";

// 鈴鐺每 10 秒輪詢 寫入時才讓 tag 失效 多半不用查資料庫
// userId 來自 session 是快取 key 每人一份

export async function cachedFeed(userId: string): Promise<NotificationFeed> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return loadFeed(userId);
}

export async function cachedNotificationList(userId: string, module?: string): Promise<NotificationItem[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return listNotifications(userId, { module });
}

export async function cachedNotificationCounts(userId: string): Promise<Record<string, { total: number; unread: number }>> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return notificationCounts(userId);
}
