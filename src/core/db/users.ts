import "server-only";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Executor } from ".";
import { coreUsers } from "./schema";

/**
 * 停用的帳號凍結 排程只處理擁有者還沒停用的列
 * 用法 innerJoin(coreUsers, activeOwnerOf(weatherSettings.userId))
 */
export function activeOwnerOf(userId: PgColumn): SQL {
  return and(eq(coreUsers.id, userId), isNull(coreUsers.disabledAt))!;
}

/**
 * 寫好幾張表的交易一開始先鎖使用者那一列 刪除帳號的連帶刪除會等它做完 不會 deadlock
 * key share 只擋刪除 no key update 連同一個人的其他交易也排隊 先數再新增時用
 */
export async function lockUserRow(executor: Executor, userId: string, mode: "key share" | "no key update"): Promise<void> {
  await executor.select({ id: coreUsers.id }).from(coreUsers).where(eq(coreUsers.id, userId)).for(mode);
}
