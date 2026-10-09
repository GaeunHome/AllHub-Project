import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notificationsTag } from "./cache-tags";
import { listNotifications, loadFeed, notificationCounts } from "./service";
import type { NotificationFeed, NotificationItem } from "./types";

// 鈴鐺每 10 秒輪詢一次；寫入通知的地方（notify、標為已讀、清理排程）都會讓 tag 失效，輪詢多半不用查資料庫
// userId 一律是呼叫端從 session 拿到的登入者，會成為快取 key：每個人各自一份，不會讀到別人的

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
