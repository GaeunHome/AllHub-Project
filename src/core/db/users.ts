import "server-only";
import { and, eq, isNull, not, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Executor } from ".";
import { coreModuleDenials, coreUsers } from "./schema";

/** 部署時新程式比 migration 先上線 欄位還不存在 從整列取值才不會整個查詢失敗 */
export const userAvatar = sql<string | null>`to_jsonb(${coreUsers}) ->> 'avatar'`;

/**
 * 查詢裡的 coreUsers 能不能用這個模組 站長一律能用
 * 只記不能用的 沒有紀錄就是能用 之後新增的模組自動開放
 */
export function canUseModuleSql(moduleId: string): SQL {
  const denied = sql`exists (select 1 from ${coreModuleDenials} where ${coreModuleDenials.userId} = ${coreUsers.id} and ${coreModuleDenials.moduleId} = ${moduleId})`;
  return or(eq(coreUsers.role, "owner"), not(denied))!;
}

/**
 * 停用與被關掉模組的人凍結 排程只處理擁有者還能用的列
 * 例如 innerJoin(coreUsers, activeOwnerOf(t.userId, "weather"))
 */
export function activeOwnerOf(userId: PgColumn, moduleId: string): SQL {
  return and(eq(coreUsers.id, userId), isNull(coreUsers.disabledAt), canUseModuleSql(moduleId))!;
}

/**
 * 交易先鎖使用者那一列 刪除帳號會等它做完 不會 deadlock
 * key share 只擋刪除 no key update 連同一人的交易也排隊
 */
export async function lockUserRow(executor: Executor, userId: string, mode: "key share" | "no key update"): Promise<void> {
  await executor.select({ id: coreUsers.id }).from(coreUsers).where(eq(coreUsers.id, userId)).for(mode);
}
