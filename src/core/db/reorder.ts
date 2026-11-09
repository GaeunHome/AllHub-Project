import "server-only";
import { and, asc, count, eq, max } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Executor } from ".";
import { movedIds, sameOrder } from "../order";
import { lockUserRow } from "./users";

/** 使用者自己排順序的表 天氣的城市 交通的常用路線 */
export type OrderedTable = PgTable & Record<"id" | "userId" | "sortOrder" | "createdAt", PgColumn>;

/** 照使用者排的順序 一樣時照加入的順序 舊程式寫的列都是 0 */
export const ownOrder = (table: OrderedTable) => [asc(table.sortOrder), asc(table.createdAt), asc(table.id)];

/**
 * beforeId 是 null 時放最後 沒改回 false 不用讓快取失效
 * 傳 tx 就在呼叫的人的交易裡 別人的 id 丟 notFound 的錯誤
 */
export function moveOwnRow(executor: Executor, table: OrderedTable, move: { userId: string; id: number; beforeId: number | null }, notFound: () => Error): Promise<boolean> {
  const { userId, id, beforeId } = move;
  return executor.transaction(async (tx) => {
    // 先鎖使用者 兩個分頁同時排時一個一個來
    await lockUserRow(tx, userId, "no key update");
    const rows = await tx.select({ id: table.id }).from(table).where(eq(table.userId, userId)).orderBy(...ownOrder(table));
    const ids = rows.map((row) => Number(row.id));
    if (!ids.includes(id) || (beforeId !== null && !ids.includes(beforeId))) throw notFound();
    const next = movedIds(ids, id, beforeId);
    if (sameOrder(next, ids)) return false;
    for (const [sortOrder, rowId] of next.entries()) await tx.update(table).set({ sortOrder }).where(and(eq(table.id, rowId), eq(table.userId, userId)));
    return true;
  });
}

/**
 * 新增前先鎖使用者再數自己有幾列 同時新增時一個一個來 才不會超過上限
 * sortOrder 是排到最後的位置 要在交易裡呼叫
 */
export async function nextOwnSlot(tx: Executor, table: OrderedTable, userId: string): Promise<{ total: number; sortOrder: number }> {
  await lockUserRow(tx, userId, "no key update");
  const [{ total, last }] = await tx.select({ total: count(), last: max(table.sortOrder) }).from(table).where(eq(table.userId, userId));
  return { total, sortOrder: last === null ? 0 : Number(last) + 1 };
}
