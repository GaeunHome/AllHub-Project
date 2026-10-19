import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/core/db";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsTransactions } from "../data/schema";
import type { DateKey } from "../lib/dates";
import { accountsWithHoldings } from "../lib/holdings";
import { accountIdsOf } from "../lib/ledger";
import type { AccountKind, EntryKind, TransactionKind } from "../lib/kinds";
import { moveInOrder, type Direction } from "../lib/order";
import { NOT_FOUND, checkAccountStart, type Parsed } from "../lib/validation";
import { CATEGORY_KIND_MISMATCH, HELD_INVESTMENT_TRANSFER, INACTIVE_ACCOUNT, SavingsUserError } from "./errors";

// userId 都是 Server Action 從 session 拿的登入者 別人的 id 一律當作不存在

export function valid<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new SavingsUserError(parsed.error);
  return parsed.value;
}

const UNIQUE_VIOLATION = "23505";

/** drizzle 把資料庫錯誤包成 DrizzleQueryError 代碼在 cause 裡 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Object; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

/**
 * 唯一索引擋下同名時改成看得懂的訊息
 * 同時送出的兩個請求只有資料庫擋得住 不能先查再寫
 */
export async function withUniqueName<T>(write: PromiseLike<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation(error)) throw new SavingsUserError(message);
    throw error;
  }
}

/** drizzle 的 and 沒條件時是 undefined 空的 where 會碰到別人的資料 */
export const allOf = (...conditions: SQL[]): SQL => and(...conditions) as SQL;

type OrderedTable = typeof savingsAccounts | typeof savingsCategories | typeof savingsHoldings;

/** 新的一列排在最後 範圍裡最大的排序值加一 */
export function nextSortOrder(table: OrderedTable, scope: SQL): SQL {
  return sql`(select coalesce(max(${table.sortOrder}) + 1, 0) from ${table} where ${scope})`;
}

/**
 * 只在範圍裡找 別人的 id 找不到就不動
 * 整批重新編號 排序值重複的舊資料也順便整理成畫面上的順序
 */
export async function moveWithin(table: OrderedTable, scope: SQL, id: number, direction: Direction): Promise<void> {
  await db().transaction(async (tx) => {
    const rows = await tx.select({ id: table.id, sortOrder: table.sortOrder }).from(table).where(scope).orderBy(asc(table.sortOrder), asc(table.id));
    const order = moveInOrder(
      rows.map((row) => row.id),
      id,
      direction,
    );
    if (!order) return;
    const current = new Map(rows.map((row) => [row.id, row.sortOrder]));
    for (const [sortOrder, rowId] of order.entries()) {
      if (current.get(rowId) !== sortOrder) await tx.update(table).set({ sortOrder }).where(eq(table.id, rowId));
    }
  });
}

export type AccountRef = { id: number; name: string; kind: AccountKind; active: boolean; createdAt: Date };

/**
 * 只找自己的帳戶 別人的 id 不在結果裡
 * share 在交易裡擋住同時停用帳戶 不擋新增紀錄的外鍵檢查 照 id 的順序鎖
 */
export async function ownAccounts(executor: Executor, userId: string, ids: number[], lock?: "share"): Promise<Map<number, AccountRef>> {
  if (ids.length === 0) return new Map();
  const query = executor
    .select({ id: savingsAccounts.id, name: savingsAccounts.name, kind: savingsAccounts.kind, active: savingsAccounts.active, createdAt: savingsAccounts.createdAt })
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.userId, userId), inArray(savingsAccounts.id, [...new Set(ids)])))
    .orderBy(asc(savingsAccounts.id));
  const rows = lock ? await query.for(lock) : await query;
  return new Map(rows.map((row) => [row.id, row]));
}

/** 別人的也當作找不到 requireActive 時停用的也擋 */
export function requireAccount(accounts: Map<number, AccountRef>, id: number, requireActive: boolean): AccountRef {
  const account = accounts.get(id);
  if (!account) throw new SavingsUserError(NOT_FOUND.account);
  if (requireActive && !account.active) throw new SavingsUserError(INACTIVE_ACCOUNT);
  return account;
}

/** 分類要是自己的 而且跟收支同一類 key share 在交易裡擋住同時刪除分類 */
export async function requireCategory(executor: Executor, userId: string, id: number, kind: EntryKind, lock?: "key share"): Promise<void> {
  const query = executor
    .select({ kind: savingsCategories.kind })
    .from(savingsCategories)
    .where(and(eq(savingsCategories.id, id), eq(savingsCategories.userId, userId)));
  const [category] = lock ? await query.for(lock) : await query;
  if (!category) throw new SavingsUserError(NOT_FOUND.category);
  if (category.kind !== kind) throw new SavingsUserError(CATEGORY_KIND_MISMATCH);
}

/** 起始餘額是開始記帳那天的 紀錄的日期不能更早 */
export function requireStarted(account: AccountRef, date: DateKey): void {
  valid(checkAccountStart(account, date));
}

/** 有持股的投資帳戶市值照持股算 一般轉帳轉進轉出的錢會從總資產消失 */
export async function heldInvestmentIds(executor: Executor, userId: string, accountIds: number[]): Promise<Set<number>> {
  if (accountIds.length === 0) return new Set();
  const rows = await executor
    .select({ accountId: savingsHoldings.accountId })
    .from(savingsHoldings)
    .where(and(eq(savingsHoldings.userId, userId), inArray(savingsHoldings.accountId, [...new Set(accountIds)])));
  return accountsWithHoldings(rows);
}

/** 錢要經過買進或賣出 持股的成本與市值才會跟著變 */
export async function rejectHeldInvestments(executor: Executor, userId: string, accountIds: number[]): Promise<void> {
  if ((await heldInvestmentIds(executor, userId, accountIds)).size > 0) throw new SavingsUserError(HELD_INVESTMENT_TRANSFER);
}

/** date 只有紀錄有 定期定額帶 holdingId 它的轉帳就是買進 */
type EntryReferences = { kind: EntryKind; accountId: number; counterAccountId: number | null; categoryId: number | null; date?: DateKey; holdingId?: number | null };

/**
 * 新用到的帳戶要啟用中 原本就用著的停用帳戶不擋 例如改舊紀錄的備註
 * 紀錄的日期不能早於任一個帳戶開始記帳的那天
 */
export async function checkEntryReferences(executor: Executor, userId: string, input: EntryReferences, alreadyUsed: (number | null)[] = []): Promise<void> {
  const ids = accountIdsOf(input);
  const accounts = await ownAccounts(executor, userId, ids);
  for (const id of ids) {
    const account = requireAccount(accounts, id, !alreadyUsed.includes(id));
    if (input.date !== undefined) requireStarted(account, input.date);
  }
  if (input.categoryId !== null) await requireCategory(executor, userId, input.categoryId, input.kind);
  if (input.kind === "transfer" && !input.holdingId) await rejectHeldInvestments(executor, userId, ids);
}

const t = savingsTransactions;
// sum 的結果是 bigint 驅動程式回字串 累計可能超過 int 所以不在 SQL 轉型
const sumOf = (kind: TransactionKind) => sql<number>`coalesce(sum(${t.amount}) filter (where ${t.kind} = ${kind}), 0)`.mapWith(Number);

type FlowSide = typeof t.accountId | typeof t.counterAccountId;

/** 一個帳戶一段時間的合計 金額都是正數 只有調整帶正負號 */
export type FlowRow = { accountId: number; period: string; income: number; expense: number; transferIn: number; transferOut: number; adjust: number };

/**
 * period 是分段的欄位 例如月份或日期 轉出算在 account_id 轉入算在 counter_account_id 兩邊各查一次再合起來
 * filter 給兩邊加一樣的條件 例如只算一個帳戶 照段再照帳戶排
 */
export async function flowsBy(executor: Executor, period: SQL<string> | typeof t.date, filter: (side: FlowSide) => SQL | undefined): Promise<FlowRow[]> {
  const [outgoing, incoming] = await Promise.all([
    executor
      .select({ accountId: t.accountId, period, income: sumOf("income"), expense: sumOf("expense"), transferOut: sumOf("transfer"), adjust: sumOf("adjust") })
      .from(t)
      .where(filter(t.accountId))
      .groupBy(t.accountId, period),
    executor
      .select({ accountId: t.counterAccountId, period, transferIn: sql<number>`sum(${t.amount})`.mapWith(Number) })
      .from(t)
      .where(and(eq(t.kind, "transfer"), filter(t.counterAccountId)))
      .groupBy(t.counterAccountId, period),
  ]);

  const flows = new Map<string, FlowRow>();
  const flowOf = (accountId: number, period: string) => {
    const key = `${accountId}|${period}`;
    let flow = flows.get(key);
    if (!flow) flows.set(key, (flow = { accountId, period, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0 }));
    return flow;
  };
  for (const row of outgoing) Object.assign(flowOf(row.accountId, row.period), { income: row.income, expense: row.expense, transferOut: row.transferOut, adjust: row.adjust });
  for (const row of incoming) if (row.accountId !== null) flowOf(row.accountId, row.period).transferIn = row.transferIn;
  return [...flows.values()].sort((a, b) => a.period.localeCompare(b.period) || a.accountId - b.accountId);
}
