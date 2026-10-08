import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notificationsTag } from "./cache-tags";
import { listNotifications, loadFeed, notificationCounts } from "./service";
import type { NotificationFeed, NotificationItem } from "./types";

// 鈴鐺每 10 秒輪詢一次；寫入通知的地方（notify、標為已讀、清理排程）都會讓 tag 失效，輪詢多半不用查資料庫

export async function cachedFeed(): Promise<NotificationFeed> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return loadFeed();
}

export async function cachedNotificationList(module?: string): Promise<NotificationItem[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return listNotifications({ module });
}

export async function cachedNotificationCounts(): Promise<Record<string, { total: number; unread: number }>> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(notificationsTag);
  return notificationCounts();
}
