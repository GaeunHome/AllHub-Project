import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsAccounts, savingsPurposes, type SavingsAccount } from "../data/schema";
import type { Direction } from "../lib/order";
import { NOT_FOUND, isRowId, parseAccountFields, parseAccountKind, type AccountInput } from "../lib/validation";
import { DUPLICATE_NAME, PAY_FROM_NOT_DEPOSIT, SavingsUserError } from "./errors";
import { allOf, moveWithin, nextSortOrder, valid, withUniqueName } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在

/** 表單的原始字串 交給 lib 的驗證解析 空字串是沒填 */
export type AccountFields = {
  name: string;
  /** deposit investment 或 credit 只在新增時有效 類型建立後不能改 */
  kind: string;
  purposeId: string;
  /**
   * 存款是起始餘額 投資是目前市值 信用卡是目前未繳 空字串是 0
   * 信用卡存成負數 負的未繳是溢繳
   */
  openingBalance: string;
  /** 只有投資有 目前的成本 空字串是跟市值一樣 */
  openingCost: string;
  monthlyPlan: string;
  targetAmount: string;
  /** 只有信用卡有 每月的繳款截止日 1 到 31 */
  dueDay: string;
  /** 只有信用卡有 扣款的存款帳戶 */
  payFromAccountId: string;
  /** 只有信用卡有 每月的結帳日 1 到 31 空字串是沒有 */
  statementDay: string;
  /** 只有信用卡有 勾選框 on 是自動扣繳 */
  autopay: string;
};

const own = (userId: string, id: number) => and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, userId));

export async function listAccounts(userId: string): Promise<SavingsAccount[]> {
  return db().select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)).orderBy(asc(savingsAccounts.sortOrder), asc(savingsAccounts.id));
}

/** 用途與扣款帳戶都要是自己的 扣款帳戶只能是存款帳戶 停用的也可以 */
async function checkReferences(userId: string, input: AccountInput, selfId: number | null): Promise<void> {
  if (input.purposeId !== null) {
    const [purpose] = await db()
      .select({ id: savingsPurposes.id })
      .from(savingsPurposes)
      .where(and(eq(savingsPurposes.id, input.purposeId), eq(savingsPurposes.userId, userId)));
    if (!purpose) throw new SavingsUserError(NOT_FOUND.purpose);
  }
  if (input.payFromAccountId !== null) {
    const [payFrom] = await db().select({ kind: savingsAccounts.kind }).from(savingsAccounts).where(own(userId, input.payFromAccountId));
    if (!payFrom) throw new SavingsUserError(NOT_FOUND.account);
    if (payFrom.kind !== "deposit" || input.payFromAccountId === selfId) throw new SavingsUserError(PAY_FROM_NOT_DEPOSIT);
  }
}

export async function createAccount(userId: string, fields: AccountFields): Promise<SavingsAccount> {
  const kind = valid(parseAccountKind(fields.kind));
  const input = valid(parseAccountFields(fields, kind, "create"));
  await checkReferences(userId, input, null);
  const [account] = await withUniqueName(
    db()
      .insert(savingsAccounts)
      .values({ ...input, userId, kind, sortOrder: nextSortOrder(savingsAccounts, eq(savingsAccounts.userId, userId)) })
      .returning(),
    DUPLICATE_NAME.account,
  );
  return account;
}

/** 類型建立後不能改 哪些欄位有效看原本的類型 */
export async function updateAccount(userId: string, id: number, fields: AccountFields): Promise<SavingsAccount> {
  const [existing] = isRowId(id) ? await db().select({ kind: savingsAccounts.kind }).from(savingsAccounts).where(own(userId, id)) : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.account);
  const input = valid(parseAccountFields(fields, existing.kind, "update"));
  await checkReferences(userId, input, id);
  const [account] = await withUniqueName(db().update(savingsAccounts).set(input).where(own(userId, id)).returning(), DUPLICATE_NAME.account);
  if (!account) throw new SavingsUserError(NOT_FOUND.account);
  return account;
}

/** 停用後不能再記帳也不算進總覽 紀錄留著 */
export async function setAccountActive(userId: string, id: number, active: boolean): Promise<void> {
  const updated = isRowId(id) ? await db().update(savingsAccounts).set({ active }).where(own(userId, id)).returning({ id: savingsAccounts.id }) : [];
  if (updated.length === 0) throw new SavingsUserError(NOT_FOUND.account);
}

/** 只在同一類型裡移動 畫面照類型分組 跨類型交換看起來會像沒動 */
export async function moveAccount(userId: string, id: number, direction: Direction): Promise<void> {
  const [account] = isRowId(id) ? await db().select({ kind: savingsAccounts.kind }).from(savingsAccounts).where(own(userId, id)) : [];
  if (!account) return;
  await moveWithin(savingsAccounts, allOf(eq(savingsAccounts.userId, userId), eq(savingsAccounts.kind, account.kind)), id, direction);
}

/** 紀錄與固定收支靠外鍵 cascade 一起刪 回傳刪掉的名稱 找不到是 null */
export async function deleteAccount(userId: string, id: number): Promise<string | null> {
  if (!isRowId(id)) return null;
  const [deleted] = await db().delete(savingsAccounts).where(own(userId, id)).returning({ name: savingsAccounts.name });
  return deleted?.name ?? null;
}
