import "server-only";
import { and, asc, eq, getTableColumns, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { logError } from "@/core/errors";
import { savingsAccounts, savingsCategories, savingsRecurring, savingsTransactions, type SavingsRecurring } from "../data/schema";
import { MIN_DATE, taipeiToday, type DateKey } from "../lib/dates";
import { accountStartDate } from "../lib/ledger";
import { monthToDate, type MonthKey } from "../lib/month";
import { dueMonths, scheduledDate } from "../lib/recurring";
import { NOT_FOUND, isRowId, parseRecurringFields } from "../lib/validation";
import { SavingsUserError } from "./errors";
import { checkEntryReferences, valid, type Executor } from "./shared";

/** kind 是 expense income 或 transfer dayOfMonth 是 1 到 31 沒有那天就記月底 */
export type RecurringFields = { kind: string; accountId: string; counterAccountId: string; categoryId: string; amount: string; dayOfMonth: string; note: string };

const own = (userId: string, id: number) => and(eq(savingsRecurring.id, id), eq(savingsRecurring.userId, userId));

/** 照每月的日期排 像一份月曆 */
export async function listRecurring(userId: string): Promise<SavingsRecurring[]> {
  return db().select().from(savingsRecurring).where(eq(savingsRecurring.userId, userId)).orderBy(asc(savingsRecurring.dayOfMonth), asc(savingsRecurring.id));
}

/** 從建立的那天起算 之前的日期不補記 */
export async function createRecurring(userId: string, fields: RecurringFields, now = new Date()): Promise<SavingsRecurring> {
  const input = valid(parseRecurringFields(fields));
  await checkEntryReferences(db(), userId, input);
  const [rule] = await db()
    .insert(savingsRecurring)
    .values({ ...input, userId, createdAt: now })
    .returning();
  return rule;
}

/** 建立時間與記到的月份不變 改日期不會補記已經記過的月份 */
export async function updateRecurring(userId: string, id: number, fields: RecurringFields): Promise<SavingsRecurring> {
  const [existing] = isRowId(id)
    ? await db().select({ accountId: savingsRecurring.accountId, counterAccountId: savingsRecurring.counterAccountId }).from(savingsRecurring).where(own(userId, id))
    : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.recurring);
  const input = valid(parseRecurringFields(fields));
  await checkEntryReferences(db(), userId, input, [existing.accountId, existing.counterAccountId]);
  const [rule] = await db().update(savingsRecurring).set(input).where(own(userId, id)).returning();
  if (!rule) throw new SavingsUserError(NOT_FOUND.recurring);
  return rule;
}

export async function setRecurringActive(userId: string, id: number, active: boolean): Promise<void> {
  const updated = isRowId(id) ? await db().update(savingsRecurring).set({ active }).where(own(userId, id)).returning({ id: savingsRecurring.id }) : [];
  if (updated.length === 0) throw new SavingsUserError(NOT_FOUND.recurring);
}

/** 已經自動記的紀錄留著 recurring_id 改成 null 回傳有沒有刪到 */
export async function deleteRecurring(userId: string, id: number): Promise<boolean> {
  if (!isRowId(id)) return false;
  const deleted = await db().delete(savingsRecurring).where(own(userId, id)).returning({ id: savingsRecurring.id });
  return deleted.length > 0;
}

/** 條件式 update 只有還沒記到這個月才成功 同時跑兩次排程也不會記兩筆 */
async function claimMonth(tx: Executor, ruleId: number, month: MonthKey): Promise<boolean> {
  const first = monthToDate(month);
  const claimed = await tx
    .update(savingsRecurring)
    .set({ lastPostedMonth: first })
    .where(and(eq(savingsRecurring.id, ruleId), or(isNull(savingsRecurring.lastPostedMonth), lt(savingsRecurring.lastPostedMonth, first))))
    .returning({ id: savingsRecurring.id });
  return claimed.length > 0;
}

type PostResult = { posted: number; skipped: number };
const NOTHING: PostResult = { posted: 0, skipped: 0 };

type RuleParents = Pick<SavingsRecurring, "userId" | "accountId" | "counterAccountId" | "categoryId">;

const accountIdsOf = (rule: RuleParents) => (rule.counterAccountId === null ? [rule.accountId] : [rule.accountId, rule.counterAccountId]);

/**
 * 刪除使用者 帳戶或分類時會先鎖它再改固定收支 這裡也先鎖父列 反了會 deadlock
 * for key share 只擋刪除 不擋同時記帳
 */
async function lockParents(tx: Executor, parents: RuleParents): Promise<{ id: number; active: boolean; createdAt: Date }[]> {
  await tx.select({ id: coreUsers.id }).from(coreUsers).where(eq(coreUsers.id, parents.userId)).for("key share");
  const accounts = await tx
    .select({ id: savingsAccounts.id, active: savingsAccounts.active, createdAt: savingsAccounts.createdAt })
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.userId, parents.userId), inArray(savingsAccounts.id, accountIdsOf(parents))))
    .orderBy(asc(savingsAccounts.id))
    .for("key share");
  if (parents.categoryId !== null) await tx.select({ id: savingsCategories.id }).from(savingsCategories).where(eq(savingsCategories.id, parents.categoryId)).for("key share");
  return accounts;
}

/** 一條一個交易 失敗只影響這一條 記到的月份跟紀錄一起退回 明天再補 */
async function postRule(ruleId: number, today: DateKey): Promise<PostResult> {
  return db().transaction(async (tx): Promise<PostResult> => {
    const [parents] = await tx
      .select({ userId: savingsRecurring.userId, accountId: savingsRecurring.accountId, counterAccountId: savingsRecurring.counterAccountId, categoryId: savingsRecurring.categoryId })
      .from(savingsRecurring)
      .where(eq(savingsRecurring.id, ruleId));
    if (!parents) return NOTHING;
    const accounts = await lockParents(tx, parents);
    // 鎖住這一條再算 同時跑兩次時第二次會看到已經記過的月份
    // 用的也是最新的金額與帳戶
    const [rule] = await tx
      .select(getTableColumns(savingsRecurring))
      .from(savingsRecurring)
      .innerJoin(coreUsers, and(eq(coreUsers.id, savingsRecurring.userId), isNull(coreUsers.disabledAt)))
      .where(eq(savingsRecurring.id, ruleId))
      .for("update", { of: savingsRecurring });
    // 鎖父列之後被改到別的帳戶或分類 剛鎖的就不是它現在用的
    // 這次不記也不往前推 下一次排程再補
    if (!rule || rule.accountId !== parents.accountId || rule.counterAccountId !== parents.counterAccountId || rule.categoryId !== parents.categoryId) return NOTHING;
    const months = dueMonths(rule, today);
    if (months.length === 0) return NOTHING;

    const usable = accounts.filter((account) => account.active).length === accountIdsOf(rule).length;
    if (!rule.active || !usable) {
      // 停用期間的月份跳過但往前推 恢復後才不會一次補記一堆
      await claimMonth(tx, rule.id, months[months.length - 1]);
      return { posted: 0, skipped: months.length };
    }

    // 紀錄不能早於帳戶開始記帳的那天
    // 改到後來才建立的帳戶時 之前的月份跟停用一樣略過但往前推
    const start = accounts.map(accountStartDate).reduce((latest, date) => (date > latest ? date : latest), MIN_DATE);
    const result = { posted: 0, skipped: 0 };
    for (const month of months) {
      if (!(await claimMonth(tx, rule.id, month))) continue;
      const date = scheduledDate(month, rule.dayOfMonth);
      if (date < start) {
        result.skipped++;
        continue;
      }
      await tx.insert(savingsTransactions).values({
        userId: rule.userId,
        kind: rule.kind,
        accountId: rule.accountId,
        counterAccountId: rule.counterAccountId,
        categoryId: rule.categoryId,
        amount: rule.amount,
        date,
        note: rule.note,
        recurringId: rule.id,
      });
      result.posted++;
    }
    return result;
  });
}

/**
 * 排程 savings:recurring 幫沒停用的使用者補記到今天為止該記的
 * 回傳的摘要不含金額與名稱
 */
export async function postDueRecurring(now = new Date()): Promise<string> {
  const today = taipeiToday(now);
  // 擁有者停用時凍結 不記也不往前推 恢復後照常補記
  // 停用的固定收支也要看 才能把暫停期間的月份往前推
  const candidates = await db()
    .select({ id: savingsRecurring.id, dayOfMonth: savingsRecurring.dayOfMonth, lastPostedMonth: savingsRecurring.lastPostedMonth, createdAt: savingsRecurring.createdAt })
    .from(savingsRecurring)
    .innerJoin(coreUsers, and(eq(coreUsers.id, savingsRecurring.userId), isNull(coreUsers.disabledAt)))
    .orderBy(asc(savingsRecurring.id));

  const total: PostResult & { failed: number } = { posted: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    if (dueMonths(candidate, today).length === 0) continue;
    try {
      const result = await postRule(candidate.id, today);
      total.posted += result.posted;
      total.skipped += result.skipped;
    } catch (error) {
      total.failed++;
      // 只記錯誤種類與 id 不記金額 備註與錯誤原文
      logError("savings", "固定收支自動記帳失敗", error, candidate.id);
    }
  }

  const parts = [`自動記帳 ${total.posted} 筆`];
  if (total.skipped > 0) parts.push(`略過 ${total.skipped} 筆（帳戶或固定收支已停用，或早於帳戶開始記帳）`);
  if (total.failed > 0) parts.push(`${total.failed} 個固定收支失敗（詳見伺服器 log）`);
  return parts.join("；");
}
