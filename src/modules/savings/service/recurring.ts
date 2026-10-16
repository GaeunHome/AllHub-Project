import "server-only";
import { and, asc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { logError } from "@/core/errors";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsRecurring, savingsTransactions, type SavingsRecurring, type SavingsTransaction } from "../data/schema";
import { MIN_DATE, taipeiToday, type DateKey } from "../lib/dates";
import { accountStartDate } from "../lib/ledger";
import { monthToDate } from "../lib/month";
import { dueMonths, occurrenceDate } from "../lib/recurring";
import { NOT_FOUND, isRowId, parseConfirmFields, parseOccurrenceFields, parseRecurringFields, type RecurringFieldName, type RecurringInput } from "../lib/validation";
import { pruneCardBills } from "./cards";
import { NOT_CONFIRM_MODE, PAY_FROM_NOT_DEPOSIT, PERIOD_DONE, RECURRING_INACTIVE, RULE_CHANGED, SALARY_INTO_CREDIT, SHARES_REQUIRED, SavingsUserError } from "./errors";
import { lockOwnHolding, recordBuy } from "./holdings";
import { sendDueNotices } from "./notices";
import { claimMonth, lockOwnRule, requireOldestPending } from "./periods";
import { checkEntryReferences, heldInvestmentIds, lockUser, ownAccounts, rejectHeldInvestments, requireAccount, requireStarted, valid, type Executor } from "./shared";

/** 表單的原始字串 交給 lib 解析 定期定額送 regular 或帶 holdingId 的 transfer */
export type RecurringFields = Record<RecurringFieldName, string>;

/** period 是 YYYY-MM amount 是實際的金額 shares 只有定期定額要 */
export type ConfirmFields = { ruleId: string; period: string; amount: string; date: string; note: string; shares: string };
export type SkipFields = { ruleId: string; period: string };

const own = (userId: string, id: number) => and(eq(savingsRecurring.id, id), eq(savingsRecurring.userId, userId));

/** 照每月的日期排 像一份月曆 */
export async function listRecurring(userId: string): Promise<SavingsRecurring[]> {
  return db().select().from(savingsRecurring).where(eq(savingsRecurring.userId, userId)).orderBy(asc(savingsRecurring.dayOfMonth), asc(savingsRecurring.id));
}

/**
 * 定期定額的轉入帳戶照那一檔所在的投資帳戶 不信任表單送來的
 * 扣款帳戶要是存款帳戶 薪水不能入帳到信用卡
 */
async function resolveRule(userId: string, input: RecurringInput): Promise<RecurringInput> {
  let resolved = input;
  if (input.holdingId !== null) {
    const [holding] = await db()
      .select({ accountId: savingsHoldings.accountId })
      .from(savingsHoldings)
      .where(and(eq(savingsHoldings.id, input.holdingId), eq(savingsHoldings.userId, userId)));
    if (!holding) throw new SavingsUserError(NOT_FOUND.holding);
    resolved = { ...input, counterAccountId: holding.accountId };
  }
  if (resolved.holdingId !== null || resolved.allocate) {
    const account = (await ownAccounts(db(), userId, [resolved.accountId])).get(resolved.accountId);
    if (account && resolved.holdingId !== null && account.kind !== "deposit") throw new SavingsUserError(PAY_FROM_NOT_DEPOSIT);
    if (account && resolved.allocate && account.kind === "credit") throw new SavingsUserError(SALARY_INTO_CREDIT);
  }
  return resolved;
}

/** 從建立的那天起算 之前的日期不算 */
export async function createRecurring(userId: string, fields: RecurringFields, now = new Date()): Promise<SavingsRecurring> {
  const input = await resolveRule(userId, valid(parseRecurringFields(fields)));
  await checkEntryReferences(db(), userId, input);
  const [rule] = await db()
    .insert(savingsRecurring)
    .values({ ...input, userId, createdAt: now })
    .returning();
  return rule;
}

/** 建立時間與游標不變 改日期或間隔不會重來已經處理過的期別 */
export async function updateRecurring(userId: string, id: number, fields: RecurringFields): Promise<SavingsRecurring> {
  const [existing] = isRowId(id)
    ? await db().select({ accountId: savingsRecurring.accountId, counterAccountId: savingsRecurring.counterAccountId }).from(savingsRecurring).where(own(userId, id))
    : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.recurring);
  const input = await resolveRule(userId, valid(parseRecurringFields(fields)));
  await checkEntryReferences(db(), userId, input, [existing.accountId, existing.counterAccountId]);
  const [rule] = await db().update(savingsRecurring).set(input).where(own(userId, id)).returning();
  if (!rule) throw new SavingsUserError(NOT_FOUND.recurring);
  return rule;
}

export async function setRecurringActive(userId: string, id: number, active: boolean): Promise<void> {
  const updated = isRowId(id) ? await db().update(savingsRecurring).set({ active }).where(own(userId, id)).returning({ id: savingsRecurring.id }) : [];
  if (updated.length === 0) throw new SavingsUserError(NOT_FOUND.recurring);
}

/** 已經記的紀錄留著 recurring_id 改成 null 回傳有沒有刪到 */
export async function deleteRecurring(userId: string, id: number): Promise<boolean> {
  if (!isRowId(id)) return false;
  const deleted = await db().delete(savingsRecurring).where(own(userId, id)).returning({ id: savingsRecurring.id });
  return deleted.length > 0;
}

type RuleParents = Pick<SavingsRecurring, "userId" | "accountId" | "counterAccountId" | "categoryId" | "holdingId">;

const accountIdsOf = (rule: Pick<RuleParents, "accountId" | "counterAccountId">) => (rule.counterAccountId === null ? [rule.accountId] : [rule.accountId, rule.counterAccountId]);

const sameParents = (rule: RuleParents, parents: RuleParents) =>
  rule.accountId === parents.accountId && rule.counterAccountId === parents.counterAccountId && rule.categoryId === parents.categoryId && rule.holdingId === parents.holdingId;

const parentColumns = {
  userId: savingsRecurring.userId,
  accountId: savingsRecurring.accountId,
  counterAccountId: savingsRecurring.counterAccountId,
  categoryId: savingsRecurring.categoryId,
  holdingId: savingsRecurring.holdingId,
};

/**
 * 待處理按確認 寫一筆紀錄並把游標推到這一期 定期定額走買進
 * 鎖的順序 使用者 帳戶 分類 持股 再鎖這一條 跟刪除時的連帶刪改一樣 不會 deadlock
 */
export async function confirmOccurrence(userId: string, fields: ConfirmFields, now = new Date()): Promise<{ rule: SavingsRecurring; transaction: SavingsTransaction }> {
  const today = taipeiToday(now);
  const input = valid(parseConfirmFields(fields, today));
  const [parents] = await db().select(parentColumns).from(savingsRecurring).where(own(userId, input.ruleId));
  if (!parents) throw new SavingsUserError(NOT_FOUND.recurring);

  return db().transaction(async (tx) => {
    await lockUser(tx, userId);
    const accounts = await ownAccounts(tx, userId, accountIdsOf(parents), "share");
    if (parents.categoryId !== null) await tx.select({ id: savingsCategories.id }).from(savingsCategories).where(eq(savingsCategories.id, parents.categoryId)).for("key share");
    const holding = parents.holdingId === null ? null : await lockOwnHolding(tx, userId, parents.holdingId);
    const rule = await lockOwnRule(tx, userId, input.ruleId);
    // 鎖父列之後被改到別的帳戶 剛鎖的就不是它現在用的 請使用者重來
    if (!sameParents(rule, parents)) throw new SavingsUserError(RULE_CHANGED);
    if (rule.mode !== "confirm") throw new SavingsUserError(NOT_CONFIRM_MODE);
    if (!rule.active) throw new SavingsUserError(RECURRING_INACTIVE);
    requireOldestPending(rule, input.period, today);
    for (const id of accountIdsOf(rule)) requireStarted(requireAccount(accounts, id, true), input.date);
    if (holding === null && rule.counterAccountId !== null) await rejectHeldInvestments(tx, userId, accountIdsOf(rule));

    let transaction: SavingsTransaction;
    if (holding !== null) {
      if (holding.accountId !== rule.counterAccountId) throw new SavingsUserError(RULE_CHANGED);
      if (input.shares === null) throw new SavingsUserError(SHARES_REQUIRED);
      ({ transaction } = await recordBuy(tx, userId, {
        holding,
        cashAccountId: rule.accountId,
        shares: input.shares,
        amount: input.amount,
        date: input.date,
        note: input.note,
        recurring: { ruleId: rule.id, period: input.period },
      }));
    } else {
      [transaction] = await tx
        .insert(savingsTransactions)
        .values({
          userId,
          kind: rule.kind,
          accountId: rule.accountId,
          counterAccountId: rule.counterAccountId,
          categoryId: rule.categoryId,
          amount: input.amount,
          date: input.date,
          note: input.note ?? rule.note ?? rule.name,
          recurringId: rule.id,
          recurringPeriod: monthToDate(input.period),
        })
        .returning();
    }
    if (!(await claimMonth(tx, rule.id, input.period))) throw new SavingsUserError(PERIOD_DONE);
    return { rule, transaction };
  });
}

/** 只推游標不寫紀錄 跟確認一樣要照順序 停用的也不能處理 */
export async function skipOccurrence(userId: string, fields: SkipFields, now = new Date()): Promise<SavingsRecurring> {
  const today = taipeiToday(now);
  const input = valid(parseOccurrenceFields(fields));
  return db().transaction(async (tx) => {
    const rule = await lockOwnRule(tx, userId, input.ruleId);
    if (rule.mode !== "confirm") throw new SavingsUserError(NOT_CONFIRM_MODE);
    if (!rule.active) throw new SavingsUserError(RECURRING_INACTIVE);
    // 鎖了這一條之後只讀不鎖帳戶 刪除帳戶的連帶刪除要等的鎖才不會繞一圈
    const accounts = await ownAccounts(tx, userId, accountIdsOf(rule));
    for (const id of accountIdsOf(rule)) requireAccount(accounts, id, true);
    requireOldestPending(rule, input.period, today);
    if (!(await claimMonth(tx, rule.id, input.period))) throw new SavingsUserError(PERIOD_DONE);
    return rule;
  });
}

/** held 是碰到有持股的投資帳戶而略過的一般轉帳 */
type PostResult = { posted: number; skipped: number; held: number };
const NOTHING: PostResult = { posted: 0, skipped: 0, held: 0 };

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

/**
 * 一條一個交易 失敗只影響這一條 游標跟紀錄一起退回 明天再補
 * 要確認的不記 只有停用時把到期的期別略過往前推 恢復後才不會一次跳出一堆待處理
 */
async function postRule(ruleId: number, today: DateKey): Promise<PostResult> {
  return db().transaction(async (tx): Promise<PostResult> => {
    const [parents] = await tx.select(parentColumns).from(savingsRecurring).where(eq(savingsRecurring.id, ruleId));
    if (!parents) return NOTHING;
    const accounts = await lockParents(tx, parents);
    // 鎖住這一條再算 同時跑兩次時第二次會看到已經記過的期別
    // 用的也是最新的金額與帳戶
    const [rule] = await tx
      .select(getTableColumns(savingsRecurring))
      .from(savingsRecurring)
      .innerJoin(coreUsers, and(eq(coreUsers.id, savingsRecurring.userId), isNull(coreUsers.disabledAt)))
      .where(eq(savingsRecurring.id, ruleId))
      .for("update", { of: savingsRecurring });
    // 鎖父列之後被改到別的帳戶或分類 剛鎖的就不是它現在用的
    // 這次不記也不往前推 下一次排程再補
    if (!rule || !sameParents(rule, parents)) return NOTHING;
    const months = dueMonths(rule, today);
    if (months.length === 0) return NOTHING;

    const usable = accounts.filter((account) => account.active).length === accountIdsOf(rule).length;
    if (!rule.active || !usable) {
      // 停用期間的期別跳過但往前推 恢復後才不會一次補記一堆
      await claimMonth(tx, rule.id, months[months.length - 1]);
      return { ...NOTHING, skipped: months.length };
    }
    if (rule.mode === "confirm") return NOTHING;
    // 錢不會算進持股的市值 照記會從總資產消失 丟錯的話每天都會再失敗一次
    if (rule.counterAccountId !== null && (await heldInvestmentIds(tx, rule.userId, accountIdsOf(rule))).size > 0) {
      await claimMonth(tx, rule.id, months[months.length - 1]);
      console.warn("[savings] 投資帳戶有持股 略過一般轉帳的固定收支", rule.id);
      return { ...NOTHING, held: months.length };
    }

    // 紀錄不能早於帳戶開始記帳的那天
    // 改到後來才建立的帳戶時 之前的期別跟停用一樣略過但往前推
    const start = accounts.map(accountStartDate).reduce((latest, date) => (date > latest ? date : latest), MIN_DATE);
    const result = { ...NOTHING };
    for (const month of months) {
      if (!(await claimMonth(tx, rule.id, month))) continue;
      const date = occurrenceDate(rule, month);
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
        note: rule.note ?? rule.name,
        recurringId: rule.id,
      });
      result.posted++;
    }
    return result;
  });
}

/**
 * 排程 savings:recurring 補記到今天該記的 寄到期通知 再清掉舊帳單
 * 回傳的摘要不含金額與名稱
 */
export async function postDueRecurring(now = new Date()): Promise<string> {
  const today = taipeiToday(now);
  // 擁有者停用時凍結 不記也不往前推 恢復後照常補記
  // 停用的固定收支也要看 才能把暫停期間的期別往前推
  const candidates = await db()
    .select({
      id: savingsRecurring.id,
      dayOfMonth: savingsRecurring.dayOfMonth,
      intervalMonths: savingsRecurring.intervalMonths,
      startMonth: savingsRecurring.startMonth,
      holidayRule: savingsRecurring.holidayRule,
      lastPostedMonth: savingsRecurring.lastPostedMonth,
      createdAt: savingsRecurring.createdAt,
    })
    .from(savingsRecurring)
    .innerJoin(coreUsers, and(eq(coreUsers.id, savingsRecurring.userId), isNull(coreUsers.disabledAt)))
    .orderBy(asc(savingsRecurring.id));

  const total: PostResult & { failed: number } = { ...NOTHING, failed: 0 };
  for (const candidate of candidates) {
    if (dueMonths(candidate, today).length === 0) continue;
    try {
      const result = await postRule(candidate.id, today);
      total.posted += result.posted;
      total.skipped += result.skipped;
      total.held += result.held;
    } catch (error) {
      total.failed++;
      // 只記錯誤種類與 id 不記金額 備註與錯誤原文
      logError("savings", "固定收支自動記帳失敗", error, candidate.id);
    }
  }
  const notices = await sendDueNotices(today);
  let pruned: number | null;
  try {
    pruned = await pruneCardBills();
  } catch (error) {
    pruned = null;
    logError("savings", "清理舊帳單失敗", error);
  }

  const parts = [`自動記帳 ${total.posted} 筆`];
  if (total.skipped > 0) parts.push(`略過 ${total.skipped} 筆（帳戶或固定收支已停用，或早於帳戶開始記帳）`);
  if (total.held > 0) parts.push(`略過 ${total.held} 筆轉帳（投資帳戶有持股，請改用買進或賣出）`);
  if (total.failed > 0) parts.push(`${total.failed} 個固定收支失敗（詳見伺服器 log）`);
  if (notices.sent > 0) parts.push(`通知 ${notices.sent} 則`);
  if (notices.failed > 0) parts.push(`${notices.failed} 則通知失敗（詳見伺服器 log）`);
  if (pruned === null) parts.push("清理舊帳單失敗（詳見伺服器 log）");
  else if (pruned > 0) parts.push(`清掉 ${pruned} 張舊帳單`);
  return parts.join("；");
}
