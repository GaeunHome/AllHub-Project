import "server-only";
import { lt } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { RETENTION_DAYS, retentionCutoff } from ".";

/**
 * 只給通知類紀錄 不分擁有者 回傳排程的摘要
 * 記帳這類要永久保留的不能套
 */
export async function deleteExpired(column: PgColumn, label: string, now = new Date(), days = RETENTION_DAYS): Promise<string> {
  const deleted = await db().delete(column.table).where(lt(column, retentionCutoff(now, days))).returning({ at: column });
  return `刪除 ${deleted.length} 筆超過 ${days} 天的${label}`;
}
