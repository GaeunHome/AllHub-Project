import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsEntries, savingsGoals, type SavingsEntry, type SavingsGoal } from "../data/schema";
import { dateToMonth, monthToDate, taipeiMonth, type MonthKey } from "../lib/month";
import { moveInOrder, type Direction } from "../lib/order";
import type { MonthGoalTotal } from "../lib/summary";
import { parseEntryFields, parseGoalFields, type EntryFields, type GoalFields, type Parsed } from "../lib/validation";

// 每個函式的 userId 都是登入者（Server Action 從 session 拿）：只讀寫他自己的項目與紀錄，別人的 id 一律當作不存在

/** 輸入或操作有誤，訊息可以直接顯示給使用者 */
export class SavingsUserError extends Error {}

const GOAL_NOT_FOUND = "找不到這個項目，可能已經刪除了";

const goalOf = (userId: string, id: number) => and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId));

function valid<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new SavingsUserError(parsed.error);
  return parsed.value;
}

export async function listGoals(userId: string): Promise<SavingsGoal[]> {
  return db().select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(asc(savingsGoals.sortOrder), asc(savingsGoals.id));
}

export async function createGoal(userId: string, fields: GoalFields): Promise<SavingsGoal> {
  const input = valid(parseGoalFields(fields));
  const lastOrder = db()
    .select({ next: sql`coalesce(max(${savingsGoals.sortOrder}) + 1, 0)` })
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, userId));
  const [goal] = await db()
    .insert(savingsGoals)
    .values({ ...input, userId, sortOrder: sql`(${lastOrder})` })
    .returning();
  return goal;
}

export async function updateGoal(userId: string, id: number, fields: GoalFields): Promise<SavingsGoal> {
  const input = valid(parseGoalFields(fields));
  return db().transaction(async (tx) => {
    const [goal] = await tx.update(savingsGoals).set(input).where(goalOf(userId, id)).returning();
    if (!goal) throw new SavingsUserError(GOAL_NOT_FOUND);
    // 快照跟著改名，項目日後被刪除時，紀錄留下的是最後的名稱
    await tx.update(savingsEntries).set({ goalName: goal.name }).where(eq(savingsEntries.goalId, id));
    return goal;
  });
}

export async function setGoalActive(userId: string, id: number, active: boolean): Promise<void> {
  const updated = await db().update(savingsGoals).set({ active }).where(goalOf(userId, id)).returning({ id: savingsGoals.id });
  if (updated.length === 0) throw new SavingsUserError(GOAL_NOT_FOUND);
}

export async function moveGoal(userId: string, id: number, direction: Direction): Promise<void> {
  await db().transaction(async (tx) => {
    const goals = await tx
      .select({ id: savingsGoals.id, sortOrder: savingsGoals.sortOrder })
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .orderBy(asc(savingsGoals.sortOrder), asc(savingsGoals.id));
    // 只在自己的項目裡找，別人的項目 id 找不到就不動
    const order = moveInOrder(
      goals.map((g) => g.id),
      id,
      direction,
    );
    if (!order) return;

    // 整批重新編號，排序值重複的舊資料也順便整理成畫面上的順序
    const current = new Map(goals.map((g) => [g.id, g.sortOrder]));
    for (const [sortOrder, goalId] of order.entries()) {
      if (current.get(goalId) !== sortOrder) await tx.update(savingsGoals).set({ sortOrder }).where(eq(savingsGoals.id, goalId));
    }
  });
}

/** 紀錄不會跟著刪：外鍵是 on delete set null，畫面靠名稱快照顯示原本的項目 */
export async function deleteGoal(userId: string, id: number): Promise<void> {
  await db().delete(savingsGoals).where(goalOf(userId, id));
}

export type NewEntry = EntryFields & { goalId: number | null };

export async function addEntry(userId: string, { goalId, ...fields }: NewEntry, now = new Date()): Promise<SavingsEntry> {
  const input = valid(parseEntryFields(fields, taipeiMonth(now)));

  let goalName: string | null = null;
  if (goalId !== null) {
    const [goal] = await db().select({ name: savingsGoals.name }).from(savingsGoals).where(goalOf(userId, goalId));
    if (!goal) throw new SavingsUserError(GOAL_NOT_FOUND);
    goalName = goal.name;
  }

  const [entry] = await db()
    .insert(savingsEntries)
    .values({ ...input, userId, month: monthToDate(input.month), goalId, goalName })
    .returning();
  return entry;
}

/** 回傳被刪那筆的月份（已經不在了或不是自己的是 null），呼叫端只讓那個月份的快取失效 */
export async function deleteEntry(userId: string, id: number): Promise<MonthKey | null> {
  const [deleted] = await db()
    .delete(savingsEntries)
    .where(and(eq(savingsEntries.id, id), eq(savingsEntries.userId, userId)))
    .returning({ month: savingsEntries.month });
  return deleted ? dateToMonth(deleted.month) : null;
}

export async function listMonthEntries(userId: string, month: MonthKey): Promise<SavingsEntry[]> {
  return db()
    .select()
    .from(savingsEntries)
    .where(and(eq(savingsEntries.userId, userId), eq(savingsEntries.month, monthToDate(month))))
    .orderBy(asc(savingsEntries.createdAt), asc(savingsEntries.id));
}

/** 每個月份、每個項目一列；資料量是「月數 × 項目數」，彙總交給 lib 的純函式 */
export async function entryTotals(userId: string): Promise<MonthGoalTotal[]> {
  const rows = await db()
    .select({
      month: savingsEntries.month,
      goalId: savingsEntries.goalId,
      goalName: savingsEntries.goalName,
      // sum(integer) 是 bigint，驅動程式會回字串；累計可能超過 int 上限，所以不在 SQL 轉型
      amount: sql<number>`sum(${savingsEntries.amount})`.mapWith(Number),
    })
    .from(savingsEntries)
    .where(eq(savingsEntries.userId, userId))
    .groupBy(savingsEntries.month, savingsEntries.goalId, savingsEntries.goalName);
  return rows.map((row) => ({ ...row, month: dateToMonth(row.month) }));
}
