import "server-only";
import { lt } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { RETENTION_DAYS, retentionCutoff } from "./retention";

/**
 * 通知類紀錄的清理排程用 刪掉 column 早於保留期的列 不分擁有者 回傳排程的摘要
 * 例如 deleteExpired(coreNotifications.createdAt, "網站通知") 記帳這類要永久保留的不能套
 */
export async function deleteExpired(column: PgColumn, label: string, now = new Date()): Promise<string> {
  const deleted = await db().delete(column.table).where(lt(column, retentionCutoff(now))).returning({ at: column });
  return `刪除 ${deleted.length} 筆超過 ${RETENTION_DAYS} 天的${label}`;
}
