import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsPurposes, type SavingsPurpose } from "../data/schema";
import type { Direction } from "../lib/order";
import { NOT_FOUND, isRowId, parsePurposeFields } from "../lib/validation";
import { DUPLICATE_NAME, SavingsUserError } from "./errors";
import { moveWithin, nextSortOrder, valid, withUniqueName } from "./shared";

export type PurposeFields = { name: string; color: string };

const own = (userId: string, id: number) => and(eq(savingsPurposes.id, id), eq(savingsPurposes.userId, userId));

export async function listPurposes(userId: string): Promise<SavingsPurpose[]> {
  return db().select().from(savingsPurposes).where(eq(savingsPurposes.userId, userId)).orderBy(asc(savingsPurposes.sortOrder), asc(savingsPurposes.id));
}

export async function createPurpose(userId: string, fields: PurposeFields): Promise<SavingsPurpose> {
  const input = valid(parsePurposeFields(fields));
  const [purpose] = await withUniqueName(
    db()
      .insert(savingsPurposes)
      .values({ ...input, userId, sortOrder: nextSortOrder(savingsPurposes, eq(savingsPurposes.userId, userId)) })
      .returning(),
    DUPLICATE_NAME.purpose,
  );
  return purpose;
}

export async function updatePurpose(userId: string, id: number, fields: PurposeFields): Promise<SavingsPurpose> {
  if (!isRowId(id)) throw new SavingsUserError(NOT_FOUND.purpose);
  const input = valid(parsePurposeFields(fields));
  const [purpose] = await withUniqueName(db().update(savingsPurposes).set(input).where(own(userId, id)).returning(), DUPLICATE_NAME.purpose);
  if (!purpose) throw new SavingsUserError(NOT_FOUND.purpose);
  return purpose;
}

export async function movePurpose(userId: string, id: number, direction: Direction): Promise<void> {
  await moveWithin(savingsPurposes, eq(savingsPurposes.userId, userId), id, direction);
}

/** 用到它的帳戶靠外鍵 set null 改成未設定 回傳刪掉的名稱 找不到是 null */
export async function deletePurpose(userId: string, id: number): Promise<string | null> {
  if (!isRowId(id)) return null;
  const [deleted] = await db().delete(savingsPurposes).where(own(userId, id)).returning({ name: savingsPurposes.name });
  return deleted?.name ?? null;
}
