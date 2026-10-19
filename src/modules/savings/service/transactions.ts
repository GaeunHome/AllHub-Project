import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { savingsAccounts, savingsCardBills, savingsCategories, savingsHoldings, savingsRecurring, savingsTransactions, type SavingsAccount, type SavingsTransaction } from "../data/schema";
import type { ChecklistRecord } from "../lib/checklist";
import { taipeiToday, type DateKey } from "../lib/dates";
import type { CategoryKind, TransactionKind } from "../lib/kinds";
import { accountBalances, accountIdsOf, balanceAdjustment, type AccountMonthFlow, type CategoryMonthTotal } from "../lib/ledger";
import { MAX_AMOUNT } from "../lib/money";
import { addMonths, dateToMonth, monthToDate, parseMonth, type MonthKey } from "../lib/month";
import { isPeriodRecord, previousOccurrenceMonth, revertsPeriod } from "../lib/recurring";
import { NOT_FOUND, amountFromText, isRowId, parseBalanceFields, parseEntryDate, parseEntryFields, parseNote, parseRowId, parseSalaryFields } from "../lib/validation";
import {
  ADJUST_NOT_EDITABLE,
  ADJUST_TOO_LARGE,
  BALANCE_HELD_INVESTMENT,
  BALANCE_NOT_FOR_CREDIT,
  BILL_ADJUST_NOT_EDITABLE,
  BILL_ROW_NOT_EDITABLE,
  INACTIVE_ACCOUNT,
  NOT_CONFIRM_MODE,
  NOT_INCOME_RULE,
  PERIOD_DONE,
  RECURRING_INACTIVE,
  SALARY_INTO_CREDIT,
  SALARY_TO_CREDIT,
  SavingsUserError,
  TRADE_NOT_EDITABLE,
} from "./errors";
import { revertTrade } from "./holdings";
import { claimMonth, lockOwnRule, requireOldestPending } from "./periods";
import { checkEntryReferences, flowsBy, heldInvestmentIds, ownAccounts, rejectHeldInvestments, requireAccount, requireCategory, requireStarted, valid } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在 now 讓測試固定今天

/**
 * kind 是 expense income 或 transfer
 * 轉帳要 counterAccountId 不能有分類 收支的分類可以留空
 */
export type TransactionFields = { kind: string; accountId: string; counterAccountId: string; categoryId: string; amount: string; date: string; note: string };

/**
 * 明細用 帶上帳戶與分類的名稱 recurring 是固定收支記的或確認的
 * holdingSymbol 是買賣的那一檔 持股刪掉後是 null recurringName 是固定收支的名稱
 */
export type TransactionView = SavingsTransaction & {
  accountName: string;
  counterAccountName: string | null;
  categoryName: string | null;
  holdingSymbol: string | null;
  recurringName: string | null;
  recurring: boolean;
};

/** actual 存款填餘額 沒有持股的投資帳戶填市值 */
export type BalanceFields = { accountId: string; actual: string };

/** ruleId 與 period 是從待處理確認薪水那一期時帶的 YYYY-MM 臨時的獎金不帶 */
export type SalaryFields = {
  accountId: string;
  categoryId: string;
  amount: string;
  date: string;
  note: string;
  transfers: { accountId: string; amount: string }[];
  ruleId?: string;
  period?: string;
};

const SALARY_NOTE = "發薪分配";

const own = (userId: string, id: number) => and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, userId));

export async function addTransaction(userId: string, fields: TransactionFields, now = new Date()): Promise<SavingsTransaction> {
  const input = valid(parseEntryFields(fields, taipeiToday(now)));
  await checkEntryReferences(db(), userId, input);
  const [transaction] = await db()
    .insert(savingsTransactions)
    .values({ ...input, userId })
    .returning();
  return transaction;
}

/** 收支與轉帳之間可以互換 調整只能刪除不能修改 買賣只能改日期與備註 */
export async function updateTransaction(userId: string, id: number, fields: TransactionFields, now = new Date()): Promise<SavingsTransaction> {
  const [existing] = isRowId(id)
    ? await db()
        .select({
          kind: savingsTransactions.kind,
          accountId: savingsTransactions.accountId,
          counterAccountId: savingsTransactions.counterAccountId,
          amount: savingsTransactions.amount,
          date: savingsTransactions.date,
          shares: savingsTransactions.shares,
          cardBillId: savingsTransactions.cardBillId,
        })
        .from(savingsTransactions)
        .where(own(userId, id))
    : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.transaction);
  if (existing.cardBillId !== null) return updateBillRow(userId, id, existing, fields, now);
  // 調整是用當時的實際餘額算出的差額 改金額就對不上了
  if (existing.kind === "adjust") throw new SavingsUserError(ADJUST_NOT_EDITABLE);
  if (existing.shares !== null) return updateTrade(userId, id, existing, fields, now);
  const input = valid(parseEntryFields(fields, taipeiToday(now)));
  await checkEntryReferences(db(), userId, input, [existing.accountId, existing.counterAccountId]);
  const [transaction] = await db().update(savingsTransactions).set(input).where(own(userId, id)).returning();
  if (!transaction) throw new SavingsUserError(NOT_FOUND.transaction);
  return transaction;
}

type TradeShape = { kind: TransactionKind; accountId: number; counterAccountId: number | null; amount: number };

/**
 * 金額 股數 帳戶跟持股的成本綁在一起 改了就對不上 只能改日期與備註
 * 表單送來的其他欄位跟原本一樣或沒送都可以
 */
async function updateTrade(userId: string, id: number, existing: TradeShape, fields: TransactionFields, now: Date): Promise<SavingsTransaction> {
  const differs = (raw: string, value: number | string | null, parse: (raw: string) => number | string | null) => raw.trim() !== "" && parse(raw) !== value;
  if (
    differs(fields.kind, existing.kind, (raw) => raw.trim()) ||
    differs(fields.accountId, existing.accountId, parseRowId) ||
    differs(fields.counterAccountId, existing.counterAccountId, parseRowId) ||
    differs(fields.amount, existing.amount, (raw) => amountFromText(raw))
  ) {
    throw new SavingsUserError(TRADE_NOT_EDITABLE);
  }
  const date = valid(parseEntryDate(fields.date, taipeiToday(now)));
  const note = valid(parseNote(fields.note));
  // 停用的帳戶也可以改 但日期不能早於開始記帳的那天
  const accounts = await ownAccounts(db(), userId, accountIdsOf(existing));
  for (const account of accounts.values()) requireStarted(account, date);
  const [transaction] = await db().update(savingsTransactions).set({ date, note }).where(own(userId, id)).returning();
  if (!transaction) throw new SavingsUserError(NOT_FOUND.transaction);
  return transaction;
}

/**
 * 填帳單時補的那一筆照帳單算 金額 日期 帳戶改了就對不上
 * 只能改分類與備註 調整連備註都照帳單寫
 */
async function updateBillRow(userId: string, id: number, existing: { kind: TransactionKind; accountId: number; amount: number; date: string }, fields: TransactionFields, now: Date): Promise<SavingsTransaction> {
  if (existing.kind !== "expense") throw new SavingsUserError(BILL_ADJUST_NOT_EDITABLE);
  const input = valid(parseEntryFields(fields, taipeiToday(now)));
  if (input.kind !== "expense" || input.accountId !== existing.accountId || input.amount !== existing.amount || input.date !== existing.date) throw new SavingsUserError(BILL_ROW_NOT_EDITABLE);
  if (input.categoryId !== null) await requireCategory(db(), userId, input.categoryId, "expense");
  const [transaction] = await db().update(savingsTransactions).set({ categoryId: input.categoryId, note: input.note }).where(own(userId, id)).returning();
  if (!transaction) throw new SavingsUserError(NOT_FOUND.transaction);
  return transaction;
}

/**
 * 已經不在或不是自己的回 false 買賣紀錄把持股還原 自動記的不退游標
 * 確認來的紀錄把游標退回去 帳單補的那一筆連帳單一起刪 待處理都會再出現
 */
export async function deleteTransaction(userId: string, id: number): Promise<boolean> {
  if (!isRowId(id)) return false;
  const [existing] = await db()
    .select({
      accountId: savingsTransactions.accountId,
      counterAccountId: savingsTransactions.counterAccountId,
      holdingId: savingsTransactions.holdingId,
      recurringId: savingsTransactions.recurringId,
      cardBillId: savingsTransactions.cardBillId,
    })
    .from(savingsTransactions)
    .where(own(userId, id));
  if (!existing) return false;
  if (existing.holdingId === null && existing.recurringId === null && existing.cardBillId === null) {
    const deleted = await db().delete(savingsTransactions).where(own(userId, id)).returning({ id: savingsTransactions.id });
    return deleted.length > 0;
  }

  return db().transaction(async (tx) => {
    // 跟刪除帳號 帳戶 持股 固定收支的連帶刪改同一個順序 最後才刪紀錄
    await lockUserRow(tx, userId, "key share");
    await ownAccounts(tx, userId, accountIdsOf(existing), "share");
    const [holding] = existing.holdingId === null ? [] : await tx.select().from(savingsHoldings).where(and(eq(savingsHoldings.id, existing.holdingId), eq(savingsHoldings.userId, userId))).for("update");
    const [rule] = existing.recurringId === null ? [] : await tx.select().from(savingsRecurring).where(and(eq(savingsRecurring.id, existing.recurringId), eq(savingsRecurring.userId, userId))).for("update");
    const [bill] =
      existing.cardBillId === null
        ? []
        : await tx
            .select({ id: savingsCardBills.id })
            .from(savingsCardBills)
            .where(and(eq(savingsCardBills.id, existing.cardBillId), eq(savingsCardBills.userId, userId)))
            .for("update");
    // 連按兩次時第二次刪不到 就不會還原兩次
    const [deleted] = await tx.delete(savingsTransactions).where(own(userId, id)).returning();
    if (!deleted) return false;
    if (holding && deleted.holdingId === holding.id && deleted.shares !== null) await revertTrade(tx, holding, deleted);
    // 薪水分出去的轉帳也標了這一期 刪掉其中一筆不代表這一期沒確認
    if (rule && deleted.recurringId === rule.id && isPeriodRecord(deleted, rule)) {
      // 收入刪了 分出去的轉帳也一起刪 不然再確認一次會多一份
      if (rule.allocate) {
        const sameRun = and(eq(savingsTransactions.userId, userId), eq(savingsTransactions.recurringId, rule.id), eq(savingsTransactions.recurringPeriod, deleted.recurringPeriod), eq(savingsTransactions.kind, "transfer"));
        await tx.delete(savingsTransactions).where(sameRun);
      }
      if (revertsPeriod(deleted, rule)) {
        const previous = previousOccurrenceMonth(rule, dateToMonth(deleted.recurringPeriod));
        await tx
          .update(savingsRecurring)
          .set({ lastPostedMonth: previous === null ? null : monthToDate(previous) })
          .where(eq(savingsRecurring.id, rule.id));
      }
    }
    // 補的那一筆刪掉就等於沒填這張帳單 待處理又會要填
    if (bill && deleted.cardBillId === bill.id) await tx.delete(savingsCardBills).where(eq(savingsCardBills.id, bill.id));
    return true;
  });
}

/** 差額記成一筆今天的調整 delta 是 0 時不寫入 */
export async function updateBalance(userId: string, fields: BalanceFields, now = new Date()): Promise<{ account: SavingsAccount; delta: number }> {
  const input = valid(parseBalanceFields(fields));
  return db().transaction(async (tx) => {
    // 先鎖帳戶再算餘額 連按兩次時第二次會等第一次寫完而算出差額 0
    // 新紀錄的外鍵檢查也會等這把鎖 不會算到一半多一筆
    const [account] = await tx
      .select()
      .from(savingsAccounts)
      .where(and(eq(savingsAccounts.id, input.accountId), eq(savingsAccounts.userId, userId)))
      .for("update");
    if (!account) throw new SavingsUserError(NOT_FOUND.account);
    if (!account.active) throw new SavingsUserError(INACTIVE_ACCOUNT);
    // 信用卡的未繳由刷卡與繳款決定 有持股的市值照股價算 調整都對不上
    if (account.kind === "credit") throw new SavingsUserError(BALANCE_NOT_FOR_CREDIT);
    if (account.kind === "investment" && (await heldInvestmentIds(tx, userId, [account.id])).size > 0) throw new SavingsUserError(BALANCE_HELD_INVESTMENT);

    const balance = accountBalances([account], await monthFlows(tx, userId, account.id)).get(account.id)?.balance ?? account.openingBalance;
    const delta = balanceAdjustment(account.kind, balance, input.actual);
    if (delta !== 0) {
      if (Math.abs(delta) > MAX_AMOUNT) throw new SavingsUserError(ADJUST_TOO_LARGE);
      await tx.insert(savingsTransactions).values({ userId, kind: "adjust", accountId: account.id, amount: delta, date: taipeiToday(now) });
    }
    return { account, delta };
  });
}

/**
 * 薪水記成收入再轉到各帳戶 同一個交易 轉出合計不能超過薪水 0 元的略過
 * 從待處理確認時收入帶上是哪一條固定收支的哪一期 一起把游標推到這一期
 */
export async function allocateSalary(userId: string, fields: SalaryFields, now = new Date()): Promise<{ income: SavingsTransaction; transfers: SavingsTransaction[]; remainder: number }> {
  const today = taipeiToday(now);
  // 只拿來限制行數與寫錯誤訊息 帳戶能不能用以交易裡鎖住後讀到的為準
  const names = await db().select({ id: savingsAccounts.id, name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.userId, userId));
  const input = valid(parseSalaryFields(fields, today, new Map(names.map((row) => [row.id, row.name]))));
  return db().transaction(async (tx) => {
    // 檢查與寫入在同一個交易 任何一筆不行就全部不寫 不會只記了薪水沒分出去
    // 先鎖使用者再鎖帳戶 新紀錄的外鍵也要鎖使用者 反了會跟刪除帳號互相等
    await lockUserRow(tx, userId, "key share");
    const accounts = await ownAccounts(
      tx,
      userId,
      [input.accountId, ...input.transfers.map((line) => line.accountId)],
      "share",
    );
    const receiving = requireAccount(accounts, input.accountId, true);
    if (receiving.kind === "credit") throw new SavingsUserError(SALARY_INTO_CREDIT);
    requireStarted(receiving, input.date);
    for (const line of input.transfers) {
      const destination = requireAccount(accounts, line.accountId, true);
      if (destination.kind === "credit") throw new SavingsUserError(SALARY_TO_CREDIT);
      requireStarted(destination, input.date);
    }
    if (input.transfers.length > 0) await rejectHeldInvestments(tx, userId, [input.accountId, ...input.transfers.map((line) => line.accountId)]);
    if (input.categoryId !== null) await requireCategory(tx, userId, input.categoryId, "income", "key share");
    // 分類之後才鎖固定收支 跟刪除分類時的連帶修改同一個順序
    const rule = input.recurring === null ? null : await lockOwnRule(tx, userId, input.recurring.ruleId);
    if (rule !== null && input.recurring !== null) {
      if (rule.kind !== "income") throw new SavingsUserError(NOT_INCOME_RULE);
      if (rule.mode !== "confirm") throw new SavingsUserError(NOT_CONFIRM_MODE);
      if (!rule.active) throw new SavingsUserError(RECURRING_INACTIVE);
      requireOldestPending(rule, input.recurring.period, today);
    }

    // 轉帳也標上是哪一期 刪掉那一期的收入時才找得到一起刪
    const period = { recurringId: rule?.id ?? null, recurringPeriod: input.recurring === null ? null : monthToDate(input.recurring.period) };
    const [income] = await tx
      .insert(savingsTransactions)
      .values({ userId, kind: "income", accountId: input.accountId, categoryId: input.categoryId, amount: input.amount, date: input.date, note: input.note, ...period })
      .returning();
    const transfers =
      input.transfers.length === 0
        ? []
        : await tx
            .insert(savingsTransactions)
            .values(input.transfers.map((line) => ({ userId, kind: "transfer" as const, accountId: input.accountId, counterAccountId: line.accountId, amount: line.amount, date: input.date, note: SALARY_NOTE, ...period })))
            .returning();
    transfers.sort((a, b) => a.id - b.id);
    if (rule !== null && input.recurring !== null && !(await claimMonth(tx, rule.id, input.recurring.period))) throw new SavingsUserError(PERIOD_DONE);
    return { income, transfers, remainder: input.amount - transfers.reduce((total, transfer) => total + transfer.amount, 0) };
  });
}

/** 日期新的在前 同一天時後建立的在前 */
export async function listMonthTransactions(userId: string, month: MonthKey): Promise<TransactionView[]> {
  // 格式不對的月份放進 SQL 會讓資料庫丟錯
  if (parseMonth(month) === null) return [];
  const counter = alias(savingsAccounts, "counter_account");
  const rows = await db()
    .select({
      ...getTableColumns(savingsTransactions),
      accountName: savingsAccounts.name,
      counterAccountName: counter.name,
      categoryName: savingsCategories.name,
      holdingSymbol: savingsHoldings.symbol,
      recurringName: savingsRecurring.name,
    })
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsAccounts.id, savingsTransactions.accountId))
    .leftJoin(counter, eq(counter.id, savingsTransactions.counterAccountId))
    .leftJoin(savingsCategories, eq(savingsCategories.id, savingsTransactions.categoryId))
    .leftJoin(savingsHoldings, eq(savingsHoldings.id, savingsTransactions.holdingId))
    .leftJoin(savingsRecurring, eq(savingsRecurring.id, savingsTransactions.recurringId))
    .where(and(eq(savingsTransactions.userId, userId), gte(savingsTransactions.date, monthToDate(month)), lt(savingsTransactions.date, monthToDate(addMonths(month, 1)))))
    // 同一個交易建立的紀錄 created_at 一樣 例如發薪分配 建立順序要看 id
    .orderBy(desc(savingsTransactions.date), desc(savingsTransactions.id));
  return rows.map((row) => ({ ...row, recurring: row.recurringId !== null }));
}

const MONTH = sql<string>`to_char(${savingsTransactions.date}, 'YYYY-MM')`;

/** 更新餘額時只算一個帳戶 而且要在交易裡讀 */
async function monthFlows(executor: Executor, userId: string, accountId?: number): Promise<AccountMonthFlow[]> {
  const flows = await flowsBy(executor, MONTH, (side) => and(eq(savingsTransactions.userId, userId), accountId === undefined ? undefined : eq(side, accountId)));
  return flows.map(({ period, ...flow }) => ({ ...flow, month: period }));
}

/** 每個帳戶每月一列 資料量是帳戶數乘月數 彙總交給 lib */
export async function accountMonthFlows(userId: string): Promise<AccountMonthFlow[]> {
  return monthFlows(db(), userId);
}

/**
 * 固定收支記下的紀錄 since 以後記的 或期別在那之後的
 * 這個月要做的事拿它對每一期有沒有記好
 */
export async function recurringRecords(userId: string, since: DateKey): Promise<ChecklistRecord[]> {
  const t = savingsTransactions;
  const rows = await db()
    .select({ recurringId: t.recurringId, recurringPeriod: t.recurringPeriod, kind: t.kind, amount: t.amount, date: t.date })
    .from(t)
    .where(and(eq(t.userId, userId), isNotNull(t.recurringId), or(gte(t.date, since), gte(t.recurringPeriod, since))))
    .orderBy(asc(t.date), asc(t.id));
  return rows.flatMap(({ recurringId, ...row }) => (recurringId === null ? [] : [{ ...row, recurringId }]));
}

/** 每個分類每月一列 只有收入與支出 */
export async function categoryMonthTotals(userId: string): Promise<CategoryMonthTotal[]> {
  const t = savingsTransactions;
  const rows = await db()
    .select({ categoryId: t.categoryId, kind: t.kind, month: MONTH, amount: sql<number>`sum(${t.amount})`.mapWith(Number) })
    .from(t)
    .where(and(eq(t.userId, userId), inArray(t.kind, ["income", "expense"])))
    .groupBy(t.categoryId, t.kind, MONTH)
    .orderBy(asc(MONTH));
  return rows.map((row) => ({ ...row, kind: row.kind as CategoryKind }));
}
