import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { savingsRecurring, type SavingsRecurring } from "../data/schema";
import { addDays, type DateKey } from "../lib/dates";
import { dateToMonth, monthToDate, type MonthKey } from "../lib/month";
import { PENDING_LOOKAHEAD_DAYS, occurrenceDate, pendingOccurrences, type RecurringLike } from "../lib/recurring";
import { NOT_FOUND } from "../lib/validation";
import { EARLIER_PERIOD_FIRST, PERIOD_DONE, PERIOD_NOT_DUE, PERIOD_NOT_PENDING, SavingsUserError } from "./errors";
import type { Executor } from "./shared";

// 固定收支的游標 自動記 確認 略過與發薪分配共用
// 紀錄 holdings 與 transactions 都會用到 放在這裡才不會互相 import

/** 條件式 update 只有游標還沒到這一期才成功 同時送兩次也只算一次 */
export async function claimMonth(executor: Executor, ruleId: number, month: MonthKey): Promise<boolean> {
  const first = monthToDate(month);
  const claimed = await executor
    .update(savingsRecurring)
    .set({ lastPostedMonth: first })
    .where(and(eq(savingsRecurring.id, ruleId), or(isNull(savingsRecurring.lastPostedMonth), lt(savingsRecurring.lastPostedMonth, first))))
    .returning({ id: savingsRecurring.id });
  return claimed.length > 0;
}

/** 鎖住自己的那一條再讀 讀到的就是最新的設定與游標 */
export async function lockOwnRule(executor: Executor, userId: string, ruleId: number): Promise<SavingsRecurring> {
  const [rule] = await executor
    .select()
    .from(savingsRecurring)
    .where(and(eq(savingsRecurring.id, ruleId), eq(savingsRecurring.userId, userId)))
    .for("update");
  if (!rule) throw new SavingsUserError(NOT_FOUND.recurring);
  return rule;
}

/** 要照順序處理 只收最舊的那一期 其他情況各說原因 */
export function requireOldestPending(rule: RecurringLike, period: MonthKey, today: DateKey): void {
  const pending = pendingOccurrences(rule, today);
  if (pending[0]?.period === period) return;
  if (pending.some((occurrence) => occurrence.period === period)) throw new SavingsUserError(EARLIER_PERIOD_FIRST);
  if (rule.lastPostedMonth !== null && period <= dateToMonth(rule.lastPostedMonth)) throw new SavingsUserError(PERIOD_DONE);
  if (occurrenceDate(rule, period) > addDays(today, PENDING_LOOKAHEAD_DAYS)) throw new SavingsUserError(PERIOD_NOT_DUE);
  throw new SavingsUserError(PERIOD_NOT_PENDING);
}
