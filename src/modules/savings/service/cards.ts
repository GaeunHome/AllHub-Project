import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsAccounts, savingsCardBills, savingsTransactions, type SavingsAccount, type SavingsCardBill, type SavingsTransaction } from "../data/schema";
import { billCutoff, billDifference, billPayments, currentStatement, lastStatementDate, statementDueDate, type CardDailyFlow, type CardStatement } from "../lib/cards";
import { addDays, taipeiToday, type DateKey } from "../lib/dates";
import type { TransactionKind } from "../lib/kinds";
import { accountStartDate } from "../lib/ledger";
import { MAX_AMOUNT } from "../lib/money";
import { NOT_FOUND, parseCardBillFields, parsePayCardFields } from "../lib/validation";
import {
  BILL_DIFFERENCE_TOO_LARGE,
  CARD_BILL_NOT_CREDIT,
  CARD_NEEDS_DUE_DAY,
  INACTIVE_ACCOUNT,
  PAY_CARD_NOT_CREDIT,
  PAY_FROM_NOT_DEPOSIT,
  STATEMENT_BEFORE_START,
  STATEMENT_DAY_MISMATCH,
  SavingsUserError,
} from "./errors";
import { lockUser, ownAccounts, requireAccount, requireCategory, requireStarted, valid, type AccountRef, type Executor } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在
// 鎖的順序 使用者 帳戶 分類 帳單 最後才寫紀錄 跟刪除帳號與帳戶的連帶刪除一樣

/** billAmount 填了就一起填這一期的帳單 categoryId 是補記的刷卡的分類 */
export type PayCardFields = { cardId: string; fromAccountId: string; amount: string; date: string; billAmount?: string; categoryId?: string };
/** amount 照銀行的帳單 statementDate 沒填是這一期 categoryId 是補記的刷卡的分類 */
export type CardBillFields = { cardId: string; amount: string; statementDate: string; categoryId: string };

export const PAY_CARD_NOTE = "繳卡費";
// 從紀錄頁看得出這一筆是填帳單時補的
const UNRECORDED_NOTE = "未記錄的刷卡（帳單差額）";
const BILL_ADJUST_NOTE = "帳單差額";
// 帳戶詳情列最近幾張帳單 排程清掉更舊的
const KEPT_BILLS = 5;

/** paid 是這張帳單繳了多少 lastPaidOn 是最後一次繳款的日期 */
export type CardBillRecord = CardStatement & { paid: number; lastPaidOn: DateKey | null };

/** difference 正的是補記的刷卡 負的是記成調整的 0 是跟紀錄一樣 */
export type BillEntry = { bill: SavingsCardBill; card: CardRow; difference: number };

type CardRow = Pick<SavingsAccount, "id" | "name" | "kind" | "active" | "openingBalance" | "statementDay" | "dueDay" | "createdAt">;

const t = savingsTransactions;
// sum 的結果是 bigint 驅動程式回字串 所以用 mapWith 轉回數字
const sumOf = (kind: TransactionKind) => sql<number>`coalesce(sum(${t.amount}) filter (where ${t.kind} = ${kind}), 0)`.mapWith(Number);

const cardColumns = {
  id: savingsAccounts.id,
  name: savingsAccounts.name,
  kind: savingsAccounts.kind,
  active: savingsAccounts.active,
  openingBalance: savingsAccounts.openingBalance,
  statementDay: savingsAccounts.statementDay,
  dueDay: savingsAccounts.dueDay,
  createdAt: savingsAccounts.createdAt,
};

/**
 * 信用卡每天的流量 since 當天也算 帳單只要看上次結帳日之後
 * 轉出算在 account_id 轉入算在 counter_account_id
 */
export async function cardDailyFlows(userId: string, since: DateKey): Promise<CardDailyFlow[]> {
  const card = (column: typeof t.accountId | typeof t.counterAccountId) => and(eq(savingsAccounts.id, column), eq(savingsAccounts.kind, "credit"));
  const [outgoing, incoming] = await Promise.all([
    db()
      .select({ accountId: t.accountId, date: t.date, income: sumOf("income"), expense: sumOf("expense"), transferOut: sumOf("transfer"), adjust: sumOf("adjust") })
      .from(t)
      .innerJoin(savingsAccounts, card(t.accountId))
      .where(and(eq(t.userId, userId), gte(t.date, since)))
      .groupBy(t.accountId, t.date),
    db()
      .select({ accountId: t.counterAccountId, date: t.date, transferIn: sql<number>`sum(${t.amount})`.mapWith(Number) })
      .from(t)
      .innerJoin(savingsAccounts, card(t.counterAccountId))
      .where(and(eq(t.userId, userId), eq(t.kind, "transfer"), gte(t.date, since)))
      .groupBy(t.counterAccountId, t.date),
  ]);

  const flows = new Map<string, CardDailyFlow>();
  const flowOf = (accountId: number, date: DateKey) => {
    const key = `${accountId}|${date}`;
    let flow = flows.get(key);
    if (!flow) flows.set(key, (flow = { accountId, date, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0 }));
    return flow;
  };
  for (const row of outgoing) Object.assign(flowOf(row.accountId, row.date), { income: row.income, expense: row.expense, transferOut: row.transferOut, adjust: row.adjust });
  for (const row of incoming) if (row.accountId !== null) flowOf(row.accountId, row.date).transferIn = row.transferIn;
  return [...flows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.accountId - b.accountId);
}

/** 每張卡最新 5 張 照結帳日新到舊 繳了多少看結帳後轉進卡的錢 */
export async function listCardBills(userId: string): Promise<CardBillRecord[]> {
  const rows = await db()
    .select({
      id: savingsCardBills.id,
      accountId: savingsCardBills.accountId,
      statementDate: savingsCardBills.statementDate,
      dueDate: savingsCardBills.dueDate,
      amount: savingsCardBills.amount,
      statementDay: savingsAccounts.statementDay,
    })
    .from(savingsCardBills)
    .innerJoin(savingsAccounts, eq(savingsAccounts.id, savingsCardBills.accountId))
    .where(eq(savingsCardBills.userId, userId))
    .orderBy(asc(savingsCardBills.accountId), desc(savingsCardBills.statementDate), desc(savingsCardBills.id));
  const kept = [...Map.groupBy(rows, (row) => row.accountId).values()].map((bills) => bills.slice(0, KEPT_BILLS));
  if (kept.length === 0) return [];

  const earliest = kept.flat().reduce((oldest, row) => {
    const cutoff = billCutoff(row, row.statementDate);
    return cutoff < oldest ? cutoff : oldest;
  }, "9999-12-31");
  const payments = await db()
    .select({ accountId: t.counterAccountId, date: t.date, amount: t.amount })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.kind, "transfer"), inArray(t.counterAccountId, kept.map((bills) => bills[0].accountId)), gt(t.date, earliest)));

  return kept.flatMap((bills) => {
    const statements = bills.map((row): CardStatement => ({ id: row.id, accountId: row.accountId, statementDate: row.statementDate, dueDate: row.dueDate, amount: row.amount }));
    const paid = new Map(billPayments(bills[0], statements, payments.filter((payment) => payment.accountId === bills[0].accountId)).map((row) => [row.id, row]));
    return statements.map((statement) => ({ ...statement, paid: paid.get(statement.id)?.paid ?? 0, lastPaidOn: paid.get(statement.id)?.lastPaidOn ?? null }));
  });
}

/** 鎖住自己的信用卡 擋住同時停用或刪除 */
async function lockCard(tx: Executor, userId: string, cardId: number): Promise<CardRow> {
  const [card] = await tx
    .select(cardColumns)
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, cardId), eq(savingsAccounts.userId, userId)))
    .for("share");
  if (!card) throw new SavingsUserError(NOT_FOUND.account);
  if (!card.active) throw new SavingsUserError(INACTIVE_ACCOUNT);
  if (card.kind !== "credit") throw new SavingsUserError(CARD_BILL_NOT_CREDIT);
  return card;
}

/** 沒指定是這一期 有結帳日的卡最早能填開始記帳時還沒繳的那一期 */
function billPeriod(card: CardRow, statementDate: DateKey | null, today: DateKey): { statementDate: DateKey; dueDate: DateKey } {
  const current = currentStatement(card, today);
  if (current === null) throw new SavingsUserError(CARD_NEEDS_DUE_DAY);
  if (statementDate === null) return current;
  const dueDate = statementDueDate(card, statementDate);
  if (dueDate === null) throw new SavingsUserError(STATEMENT_DAY_MISMATCH);
  const start = accountStartDate(card);
  const earliest = card.statementDay === null ? start : lastStatementDate(card.statementDay, addDays(start, 1));
  if (statementDate < earliest) throw new SavingsUserError(STATEMENT_BEFORE_START);
  return { statementDate, dueDate };
}

/** 起始餘額加上 cutoff 那天以前的紀錄 補的那一筆要先刪掉再算 */
async function balanceThrough(tx: Executor, userId: string, card: CardRow, cutoff: DateKey): Promise<number> {
  const [own] = await tx
    .select({ net: sql<number>`coalesce(sum(case when ${t.kind} in ('expense', 'transfer') then 0 - ${t.amount} else ${t.amount} end), 0)`.mapWith(Number) })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.accountId, card.id), lte(t.date, cutoff)));
  const [incoming] = await tx
    .select({ total: sql<number>`coalesce(sum(${t.amount}), 0)`.mapWith(Number) })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.kind, "transfer"), eq(t.counterAccountId, card.id), lte(t.date, cutoff)));
  return card.openingBalance + own.net + incoming.total;
}

/**
 * 同一期再填一次會蓋過去 先刪掉上次補的那一筆再重算 才不會補兩次
 * upsert 也鎖住帳單 同時送兩次時第二次等第一次做完
 */
async function writeBill(tx: Executor, userId: string, card: CardRow, input: { amount: number; statementDate: DateKey | null; categoryId: number | null }, today: DateKey): Promise<{ bill: SavingsCardBill; difference: number }> {
  const period = billPeriod(card, input.statementDate, today);
  const [bill] = await tx
    .insert(savingsCardBills)
    .values({ userId, accountId: card.id, statementDate: period.statementDate, dueDate: period.dueDate, amount: input.amount })
    .onConflictDoUpdate({ target: [savingsCardBills.accountId, savingsCardBills.statementDate], set: { amount: input.amount, dueDate: period.dueDate } })
    .returning();
  await tx.delete(t).where(and(eq(t.userId, userId), eq(t.cardBillId, bill.id)));
  const difference = billDifference(input.amount, await balanceThrough(tx, userId, card, billCutoff(card, period.statementDate)));
  if (Math.abs(difference) > MAX_AMOUNT) throw new SavingsUserError(BILL_DIFFERENCE_TOO_LARGE);
  if (difference !== 0) {
    // 卡是這一期中間才開始記帳的 補的那一筆不能早於開始記帳那天
    const start = accountStartDate(card);
    const date = period.statementDate < start ? start : period.statementDate;
    const fields = difference > 0 ? { kind: "expense" as const, categoryId: input.categoryId, amount: difference, note: UNRECORDED_NOTE } : { kind: "adjust" as const, amount: 0 - difference, note: BILL_ADJUST_NOTE };
    await tx.insert(t).values({ userId, accountId: card.id, date, cardBillId: bill.id, ...fields });
  }
  return { bill, difference };
}

/** 帳單金額跟紀錄算的結帳日未繳不一樣時 自動補一筆讓兩邊對得上 */
export async function enterCardBill(userId: string, fields: CardBillFields, now = new Date()): Promise<BillEntry> {
  const today = taipeiToday(now);
  const input = valid(parseCardBillFields(fields, today));
  return db().transaction(async (tx) => {
    await lockUser(tx, userId);
    const card = await lockCard(tx, userId, input.cardId);
    if (input.categoryId !== null) await requireCategory(tx, userId, input.categoryId, "expense", "key share");
    return { card, ...(await writeBill(tx, userId, card, input, today)) };
  });
}

/** 繳卡費是從存款帳戶轉到信用卡的一筆轉帳 帶了帳單金額就先填這一期的帳單 */
export async function payCard(
  userId: string,
  fields: PayCardFields,
  now = new Date(),
): Promise<{ transaction: SavingsTransaction; card: CardRow; from: AccountRef; bill: SavingsCardBill | null; difference: number }> {
  const today = taipeiToday(now);
  const input = valid(parsePayCardFields(fields, today));
  return db().transaction(async (tx) => {
    // 先鎖使用者再鎖帳戶 新紀錄的外鍵也要鎖使用者 反了會跟刪除帳號互相等
    await lockUser(tx, userId);
    const accounts = await ownAccounts(tx, userId, [input.cardId, input.fromAccountId], "share");
    const cardRef = requireAccount(accounts, input.cardId, true);
    if (cardRef.kind !== "credit") throw new SavingsUserError(PAY_CARD_NOT_CREDIT);
    const from = requireAccount(accounts, input.fromAccountId, true);
    if (from.kind !== "deposit") throw new SavingsUserError(PAY_FROM_NOT_DEPOSIT);
    requireStarted(cardRef, input.date);
    requireStarted(from, input.date);
    const [card] = await tx.select(cardColumns).from(savingsAccounts).where(eq(savingsAccounts.id, cardRef.id));
    const categoryId = input.billAmount === null ? null : input.categoryId;
    if (categoryId !== null) await requireCategory(tx, userId, categoryId, "expense", "key share");
    // 帳單先寫 補的那一筆照繳款之前的紀錄算
    const entry = input.billAmount === null ? null : await writeBill(tx, userId, card, { amount: input.billAmount, statementDate: null, categoryId }, today);
    const [transaction] = await tx
      .insert(t)
      .values({ userId, kind: "transfer", accountId: from.id, counterAccountId: card.id, amount: input.amount, date: input.date, note: PAY_CARD_NOTE })
      .returning();
    return { transaction, card, from, bill: entry?.bill ?? null, difference: entry?.difference ?? 0 };
  });
}

/** 每張卡只留最新 5 張 補的紀錄留著 card_bill_id 由外鍵改成 null 回傳刪了幾張 */
export async function pruneCardBills(): Promise<number> {
  const rows = await db()
    .select({ id: savingsCardBills.id, accountId: savingsCardBills.accountId })
    .from(savingsCardBills)
    .orderBy(asc(savingsCardBills.accountId), desc(savingsCardBills.statementDate), desc(savingsCardBills.id));
  const extra = [...Map.groupBy(rows, (row) => row.accountId).values()].flatMap((bills) => bills.slice(KEPT_BILLS).map((bill) => bill.id));
  if (extra.length === 0) return 0;
  const deleted = await db().delete(savingsCardBills).where(inArray(savingsCardBills.id, extra)).returning({ id: savingsCardBills.id });
  return deleted.length;
}
