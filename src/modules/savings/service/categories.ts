import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsCategories, type SavingsCategory } from "../data/schema";
import { nextFreeColor } from "../lib/kinds";
import type { Direction } from "../lib/order";
import { NOT_FOUND, isRowId, parseCategoryFields, parseCategoryKind } from "../lib/validation";
import { DUPLICATE_NAME, SavingsUserError } from "./errors";
import { allOf, moveWithin, nextSortOrder, valid, withUniqueName } from "./shared";

/** kind 只在新增時有效 monthlyBudget 只有支出能設 空字串是不設 icon 是 CATEGORY_ICONS 的名稱 空字串是沒選 */
export type CategoryFields = { kind: string; name: string; monthlyBudget: string; icon: string };

const own = (userId: string, id: number) => and(eq(savingsCategories.id, id), eq(savingsCategories.userId, userId));

/** 支出在前收入在後 靠 kind 的文字排序 各自照排序值 */
export async function listCategories(userId: string): Promise<SavingsCategory[]> {
  return db()
    .select()
    .from(savingsCategories)
    .where(eq(savingsCategories.userId, userId))
    .orderBy(asc(savingsCategories.kind), asc(savingsCategories.sortOrder), asc(savingsCategories.id));
}

export async function createCategory(userId: string, fields: CategoryFields): Promise<SavingsCategory> {
  const kind = valid(parseCategoryKind(fields.kind));
  const input = valid(parseCategoryFields(fields, kind));
  const sameKind = allOf(eq(savingsCategories.userId, userId), eq(savingsCategories.kind, kind));
  // 畫面不顯示顏色 但資料表要一個 修改時不動
  const used = await db().select({ color: savingsCategories.color }).from(savingsCategories).where(sameKind);
  const [category] = await withUniqueName(
    db()
      .insert(savingsCategories)
      .values({ ...input, userId, kind, color: nextFreeColor(used.map((row) => row.color)), sortOrder: nextSortOrder(savingsCategories, sameKind) })
      .returning(),
    DUPLICATE_NAME.category,
  );
  return category;
}

/** 類型建立後不能改 收不收預算看原本的類型 */
export async function updateCategory(userId: string, id: number, fields: CategoryFields): Promise<SavingsCategory> {
  const kind = isRowId(id) ? await kindOf(userId, id) : null;
  if (kind === null) throw new SavingsUserError(NOT_FOUND.category);
  const input = valid(parseCategoryFields(fields, kind));
  const [category] = await withUniqueName(db().update(savingsCategories).set(input).where(own(userId, id)).returning(), DUPLICATE_NAME.category);
  if (!category) throw new SavingsUserError(NOT_FOUND.category);
  return category;
}

async function kindOf(userId: string, id: number) {
  const [category] = await db().select({ kind: savingsCategories.kind }).from(savingsCategories).where(own(userId, id));
  return category?.kind ?? null;
}

/** 只在支出或收入同一類裡移動 */
export async function moveCategory(userId: string, id: number, direction: Direction): Promise<void> {
  const kind = isRowId(id) ? await kindOf(userId, id) : null;
  if (kind === null) return;
  await moveWithin(savingsCategories, allOf(eq(savingsCategories.userId, userId), eq(savingsCategories.kind, kind)), id, direction);
}

/** 紀錄與固定收支靠外鍵 set null 改成未分類 回傳刪掉的名稱 找不到是 null */
export async function deleteCategory(userId: string, id: number): Promise<string | null> {
  if (!isRowId(id)) return null;
  const [deleted] = await db().delete(savingsCategories).where(own(userId, id)).returning({ name: savingsCategories.name });
  return deleted?.name ?? null;
}
