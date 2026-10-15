import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/core/db";
import { savingsAccounts, savingsCategories, savingsTransactions, type SavingsAccount, type SavingsTransaction } from "../data/schema";
import { taipeiToday } from "../lib/dates";
import type { CategoryKind, PaletteColor, TransactionKind } from "../lib/kinds";
import { accountBalances, balanceAdjustment, type AccountMonthFlow, type CategoryMonthTotal } from "../lib/ledger";
import { MAX_AMOUNT } from "../lib/money";
import { addMonths, monthToDate, parseMonth, type MonthKey } from "../lib/month";
import { NOT_FOUND, isRowId, parseBalanceFields, parseEntryFields, parseRowId, parseSalaryFields } from "../lib/validation";
import { ADJUST_NOT_EDITABLE, ADJUST_TOO_LARGE, INACTIVE_ACCOUNT, SALARY_INTO_CREDIT, SALARY_TO_CREDIT, SavingsUserError } from "./errors";
import { checkEntryReferences, ownAccounts, requireAccount, requireCategory, requireStarted, valid, type Executor } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在 now 讓測試固定今天

/**
 * kind 是 expense income 或 transfer
 * 轉帳要 counterAccountId 不能有分類 收支的分類可以留空
 */
export type TransactionFields = { kind: string; accountId: string; counterAccountId: string; categoryId: string; amount: string; date: string; note: string };

/** 明細用 帶上帳戶與分類的名稱 recurring 是固定收支自動記的 */
export type TransactionView = SavingsTransaction & {
  accountName: string;
  counterAccountName: string | null;
  categoryName: string | null;
  categoryColor: PaletteColor | null;
  recurring: boolean;
};

/** actual 存款填餘額 投資填市值 信用卡填未繳 負的未繳是溢繳 */
export type BalanceFields = { accountId: string; actual: string };

export type SalaryFields = { accountId: string; categoryId: string; amount: string; date: string; note: string; transfers: { accountId: string; amount: string }[] };

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

/** 收支與轉帳之間可以互換 調整只能刪除不能修改 */
export async function updateTransaction(userId: string, id: number, fields: TransactionFields, now = new Date()): Promise<SavingsTransaction> {
  const [existing] = isRowId(id)
    ? await db()
        .select({ kind: savingsTransactions.kind, accountId: savingsTransactions.accountId, counterAccountId: savingsTransactions.counterAccountId })
        .from(savingsTransactions)
        .where(own(userId, id))
    : [];
  if (!existing) throw new SavingsUserError(NOT_FOUND.transaction);
  // 調整是用當時的實際餘額算出的差額 改金額就對不上了
  if (existing.kind === "adjust") throw new SavingsUserError(ADJUST_NOT_EDITABLE);
  const input = valid(parseEntryFields(fields, taipeiToday(now)));
  await checkEntryReferences(db(), userId, input, [existing.accountId, existing.counterAccountId]);
  const [transaction] = await db().update(savingsTransactions).set(input).where(own(userId, id)).returning();
  if (!transaction) throw new SavingsUserError(NOT_FOUND.transaction);
  return transaction;
}

/** 已經不在或不是自己的回 false */
export async function deleteTransaction(userId: string, id: number): Promise<boolean> {
  if (!isRowId(id)) return false;
  const deleted = await db().delete(savingsTransactions).where(own(userId, id)).returning({ id: savingsTransactions.id });
  return deleted.length > 0;
}

/** 差額記成一筆今天的調整 delta 是 0 時不寫入 */
export async function updateBalance(userId: string, fields: BalanceFields, now = new Date()): Promise<{ account: SavingsAccount; delta: number }> {
  const accountId = parseRowId(fields.accountId);
  if (accountId === null) throw new SavingsUserError(NOT_FOUND.account);
  return db().transaction(async (tx) => {
    // 先鎖帳戶再算餘額 連按兩次時第二次會等第一次寫完而算出差額 0
    // 新紀錄的外鍵檢查也會等這把鎖 不會算到一半多一筆
    const [account] = await tx
      .select()
      .from(savingsAccounts)
      .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)))
      .for("update");
    if (!account) throw new SavingsUserError(NOT_FOUND.account);
    if (!account.active) throw new SavingsUserError(INACTIVE_ACCOUNT);
    // 能不能填負數看帳戶類型 所以讀到帳戶才解析金額
    const input = valid(parseBalanceFields(fields, account.kind));

    const balance = accountBalances([account], await monthFlows(tx, userId, account.id)).get(account.id)?.balance ?? account.openingBalance;
    const delta = balanceAdjustment(account.kind, balance, input.actual);
    if (delta !== 0) {
      if (Math.abs(delta) > MAX_AMOUNT) throw new SavingsUserError(ADJUST_TOO_LARGE);
      await tx.insert(savingsTransactions).values({ userId, kind: "adjust", accountId: account.id, amount: delta, date: taipeiToday(now) });
    }
    return { account, delta };
  });
}

/** 薪水記成收入再轉到各帳戶 同一個交易 轉出合計不能超過薪水 0 元的略過 */
export async function allocateSalary(userId: string, fields: SalaryFields, now = new Date()): Promise<{ income: SavingsTransaction; transfers: SavingsTransaction[]; remainder: number }> {
  // 只拿來限制行數與寫錯誤訊息 帳戶能不能用以交易裡鎖住後讀到的為準
  const names = await db().select({ id: savingsAccounts.id, name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.userId, userId));
  const input = valid(parseSalaryFields(fields, taipeiToday(now), new Map(names.map((row) => [row.id, row.name]))));
  return db().transaction(async (tx) => {
    // 檢查與寫入在同一個交易 任何一筆不行就全部不寫 不會只記了薪水沒分出去
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
    if (input.categoryId !== null) await requireCategory(tx, userId, input.categoryId, "income");

    const [income] = await tx
      .insert(savingsTransactions)
      .values({ userId, kind: "income", accountId: input.accountId, categoryId: input.categoryId, amount: input.amount, date: input.date, note: input.note })
      .returning();
    const transfers =
      input.transfers.length === 0
        ? []
        : await tx
            .insert(savingsTransactions)
            .values(input.transfers.map((line) => ({ userId, kind: "transfer" as const, accountId: input.accountId, counterAccountId: line.accountId, amount: line.amount, date: input.date, note: SALARY_NOTE })))
            .returning();
    transfers.sort((a, b) => a.id - b.id);
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
      categoryColor: savingsCategories.color,
    })
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsAccounts.id, savingsTransactions.accountId))
    .leftJoin(counter, eq(counter.id, savingsTransactions.counterAccountId))
    .leftJoin(savingsCategories, eq(savingsCategories.id, savingsTransactions.categoryId))
    .where(and(eq(savingsTransactions.userId, userId), gte(savingsTransactions.date, monthToDate(month)), lt(savingsTransactions.date, monthToDate(addMonths(month, 1)))))
    // 同一個交易建立的紀錄 created_at 一樣 例如發薪分配 建立順序要看 id
    .orderBy(desc(savingsTransactions.date), desc(savingsTransactions.id));
  return rows.map((row) => ({ ...row, recurring: row.recurringId !== null }));
}

const MONTH = sql<string>`to_char(${savingsTransactions.date}, 'YYYY-MM')`;
// sum 的結果是 bigint 驅動程式回字串 累計可能超過 int 所以不在 SQL 轉型
const sumOf = (kind: TransactionKind) => sql<number>`coalesce(sum(${savingsTransactions.amount}) filter (where ${savingsTransactions.kind} = ${kind}), 0)`.mapWith(Number);

/**
 * 轉入算在 counter_account_id 其他都算在 account_id
 * 更新餘額時只算一個帳戶 而且要在交易裡讀
 */
async function monthFlows(executor: Executor, userId: string, accountId?: number): Promise<AccountMonthFlow[]> {
  const t = savingsTransactions;
  const only = (column: typeof t.accountId | typeof t.counterAccountId): SQL | undefined => (accountId === undefined ? undefined : eq(column, accountId));
  const [outgoing, incoming] = await Promise.all([
    executor
      .select({ accountId: t.accountId, month: MONTH, income: sumOf("income"), expense: sumOf("expense"), transferOut: sumOf("transfer"), adjust: sumOf("adjust") })
      .from(t)
      .where(and(eq(t.userId, userId), only(t.accountId)))
      .groupBy(t.accountId, MONTH),
    executor
      .select({ accountId: t.counterAccountId, month: MONTH, transferIn: sql<number>`sum(${t.amount})`.mapWith(Number) })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.kind, "transfer"), only(t.counterAccountId)))
      .groupBy(t.counterAccountId, MONTH),
  ]);

  const flows = new Map<string, AccountMonthFlow>();
  const flowOf = (id: number, month: MonthKey) => {
    const key = `${id}|${month}`;
    let flow = flows.get(key);
    if (!flow) flows.set(key, (flow = { accountId: id, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0 }));
    return flow;
  };
  for (const row of outgoing) Object.assign(flowOf(row.accountId, row.month), { income: row.income, expense: row.expense, transferOut: row.transferOut, adjust: row.adjust });
  for (const row of incoming) if (row.accountId !== null) flowOf(row.accountId, row.month).transferIn = row.transferIn;
  return [...flows.values()].sort((a, b) => a.month.localeCompare(b.month) || a.accountId - b.accountId);
}

/** 每個帳戶每月一列 資料量是帳戶數乘月數 彙總交給 lib */
export async function accountMonthFlows(userId: string): Promise<AccountMonthFlow[]> {
  return monthFlows(db(), userId);
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
