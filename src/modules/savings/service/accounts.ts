import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { savingsAccounts, type SavingsAccount } from "../data/schema";
import type { Direction } from "../lib/order";
import { ALLOCATION_ACCOUNT_INVALID, NOT_FOUND, isRowId, parseAccountFields, parseAccountKind, parseAllocationFields, type AccountInput } from "../lib/validation";
import { DUPLICATE_NAME, PAY_FROM_NOT_DEPOSIT, SavingsUserError } from "./errors";
import { allOf, moveWithin, nextSortOrder, valid, withUniqueName } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在

/** 表單的原始字串 交給 lib 的驗證解析 空字串是沒填 */
export type AccountFields = {
  name: string;
  /** deposit investment 或 credit 只在新增時有效 類型建立後不能改 */
  kind: string;
  /** 用途 例如生活費 空字串是沒填 */
  label: string;
  /** 只有信用卡有 卡面顏色 空字串是沒選 */
  cardStyle: string;
  /**
   * 存款是起始餘額 投資是目前市值 信用卡是目前未繳 空字串是 0
   * 信用卡存成負數 負的未繳是溢繳
   */
  openingBalance: string;
  /** 只有投資有 目前的成本 空字串是跟市值一樣 */
  openingCost: string;
  monthlyPlan: string;
  targetAmount: string;
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

/** 扣款帳戶要是自己的存款帳戶 停用的也可以 */
async function checkReferences(userId: string, input: AccountInput, selfId: number | null): Promise<void> {
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

/** 類型建立後不能改 哪些欄位有效看原本的類型 舊的繳款截止日不動 只當填帳單的預設 */
export async function updateAccount(userId: string, id: number, fields: AccountFields): Promise<SavingsAccount> {
  const [existing] = isRowId(id) ? await db().select({ kind: savingsAccounts.kind }).from(savingsAccounts).where(own(userId, id)) : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.account);
  const input = valid(parseAccountFields(fields, existing.kind, "update"));
  await checkReferences(userId, input, id);
  const [account] = await withUniqueName(db().update(savingsAccounts).set(input).where(own(userId, id)).returning(), DUPLICATE_NAME.account);
  if (!account) throw new SavingsUserError(NOT_FOUND.account);
  return account;
}

/** 修改分配的一個帳戶 空字串是不設 */
export type AllocationFields = { accountId: string; monthlyPlan: string; targetAmount: string };

/**
 * 一次改好幾個帳戶的每月規劃與目標 同一個交易
 * 只能是自己的存款或投資帳戶 有一個不是就整批不寫 回傳改了幾個
 */
export async function updateAllocation(userId: string, lines: AllocationFields[]): Promise<number> {
  // 只拿來限制行數與寫錯誤訊息 能不能改以交易裡鎖住後讀到的為準
  const names = await db().select({ id: savingsAccounts.id, name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.userId, userId));
  const input = valid(parseAllocationFields(lines, new Map(names.map((row) => [row.id, row.name]))));
  const ids = input.map((line) => line.accountId);
  return db().transaction(async (tx) => {
    // 一次鎖好幾個帳戶 先鎖使用者 刪除帳號時的連帶刪除才不會跟它互相等
    await lockUserRow(tx, userId, "key share");
    const accounts = await tx
      .select({ id: savingsAccounts.id, kind: savingsAccounts.kind })
      .from(savingsAccounts)
      .where(and(eq(savingsAccounts.userId, userId), inArray(savingsAccounts.id, ids)))
      .orderBy(asc(savingsAccounts.id))
      .for("no key update");
    if (accounts.length !== ids.length || accounts.some((account) => account.kind === "credit")) throw new SavingsUserError(ALLOCATION_ACCOUNT_INVALID);
    for (const line of input) {
      await tx.update(savingsAccounts).set({ monthlyPlan: line.monthlyPlan, targetAmount: line.targetAmount }).where(own(userId, line.accountId));
    }
    return input.length;
  });
}

/** 停用後不能再記帳也不算進總覽 紀錄留著 */
export async function setAccountActive(userId: string, id: number, active: boolean): Promise<void> {
  const updated = isRowId(id) ? await db().update(savingsAccounts).set({ active }).where(own(userId, id)).returning({ id: savingsAccounts.id }) : [];
  if (updated.length === 0) throw new SavingsUserError(NOT_FOUND.account);
}

/**
 * 只在同一類型的啟用中帳戶裡移動 畫面照類型分組 停用的收在最下面
 * 跟別的類型或停用的交換看起來會像沒動
 */
export async function moveAccount(userId: string, id: number, direction: Direction): Promise<void> {
  const [account] = isRowId(id) ? await db().select({ kind: savingsAccounts.kind }).from(savingsAccounts).where(own(userId, id)) : [];
  if (!account) return;
  await moveWithin(savingsAccounts, allOf(eq(savingsAccounts.userId, userId), eq(savingsAccounts.kind, account.kind), eq(savingsAccounts.active, true)), id, direction);
}

/** 紀錄與固定收支靠外鍵 cascade 一起刪 回傳刪掉的名稱 找不到是 null */
export async function deleteAccount(userId: string, id: number): Promise<string | null> {
  if (!isRowId(id)) return null;
  const [deleted] = await db().delete(savingsAccounts).where(own(userId, id)).returning({ name: savingsAccounts.name });
  return deleted?.name ?? null;
}
