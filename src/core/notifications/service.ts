import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { coreNotifications, type CoreNotification } from "../db/schema";
import { RETENTION_DAYS, retentionCutoff } from "../retention";
import type { NotificationFeed, NotificationItem, UnreadSummary } from "./types";

/** 鈴鐺面板顯示的筆數，也是輪詢時順便帶回的筆數 */
const RECENT_LIMIT = 10;
// 通知頁一次列出的上限；14 天內正常用不到這麼多
const LIST_LIMIT = 500;

// 每次讀寫都只碰收件人自己的通知；user_id 是 null 的（部署空窗期舊程式寫入的）沒有人看得到，等清理排程刪掉
const ownedBy = (userId: string) => eq(coreNotifications.userId, userId);
// 清理排程可能晚一點才跑，讀取時也要套用保留期，畫面才跟保留規則一致
const withinRetention = (now: Date) => gte(coreNotifications.createdAt, retentionCutoff(now));
const newestFirst = [desc(coreNotifications.createdAt), desc(coreNotifications.id)];

function toItem(row: CoreNotification): NotificationItem {
  return {
    id: row.id,
    module: row.module,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  };
}

export async function unreadSummary(userId: string, now = new Date()): Promise<UnreadSummary> {
  const rows = await db()
    .select({ module: coreNotifications.module, count: count() })
    .from(coreNotifications)
    .where(and(ownedBy(userId), isNull(coreNotifications.readAt), withinRetention(now)))
    .groupBy(coreNotifications.module);
  return { total: rows.reduce((sum, row) => sum + row.count, 0), byModule: Object.fromEntries(rows.map((row) => [row.module, row.count])) };
}

export async function recentNotifications(userId: string, limit = RECENT_LIMIT, now = new Date()): Promise<NotificationItem[]> {
  const rows = await db()
    .select()
    .from(coreNotifications)
    .where(and(ownedBy(userId), withinRetention(now)))
    .orderBy(...newestFirst)
    .limit(limit);
  return rows.map(toItem);
}

export async function loadFeed(userId: string, now = new Date()): Promise<NotificationFeed> {
  const [unread, recent] = await Promise.all([unreadSummary(userId, now), recentNotifications(userId, RECENT_LIMIT, now)]);
  return { unread, recent };
}

export async function listNotifications(userId: string, { module, now = new Date() }: { module?: string; now?: Date } = {}): Promise<NotificationItem[]> {
  const rows = await db()
    .select()
    .from(coreNotifications)
    .where(and(ownedBy(userId), withinRetention(now), module ? eq(coreNotifications.module, module) : undefined))
    .orderBy(...newestFirst)
    .limit(LIST_LIMIT);
  return rows.map(toItem);
}

/** 通知頁的模組篩選按鈕：只列出保留期內有通知的模組 */
export async function notificationCounts(userId: string, now = new Date()): Promise<Record<string, { total: number; unread: number }>> {
  const rows = await db()
    .select({
      module: coreNotifications.module,
      total: count(),
      unread: sql<number>`count(*) filter (where ${coreNotifications.readAt} is null)`.mapWith(Number),
    })
    .from(coreNotifications)
    .where(and(ownedBy(userId), withinRetention(now)))
    .groupBy(coreNotifications.module);
  return Object.fromEntries(rows.map(({ module, total, unread }) => [module, { total, unread }]));
}

/** 已經讀過的不改時間；別人的通知 id 不會被改到；回傳這次新標記的筆數 */
export async function markNotificationsRead(userId: string, ids: number[], now = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db()
    .update(coreNotifications)
    .set({ readAt: now })
    .where(and(ownedBy(userId), inArray(coreNotifications.id, ids), isNull(coreNotifications.readAt)))
    .returning({ id: coreNotifications.id });
  return updated.length;
}

export async function markAllNotificationsRead(userId: string, module?: string, now = new Date()): Promise<number> {
  const updated = await db()
    .update(coreNotifications)
    .set({ readAt: now })
    .where(and(ownedBy(userId), isNull(coreNotifications.readAt), module ? eq(coreNotifications.module, module) : undefined))
    .returning({ id: coreNotifications.id });
  return updated.length;
}

/** 通知只保留 RETENTION_DAYS 天，不分收件人、已讀未讀都刪 */
export async function cleanupNotifications(now = new Date()): Promise<string> {
  const deleted = await db()
    .delete(coreNotifications)
    .where(lt(coreNotifications.createdAt, retentionCutoff(now)))
    .returning({ id: coreNotifications.id });
  return `刪除 ${deleted.length} 筆超過 ${RETENTION_DAYS} 天的網站通知`;
}
