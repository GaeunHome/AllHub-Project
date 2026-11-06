import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { travelExpenses, travelExpenseShares, travelMembers, travelSettlements } from "../data/schema";
import { EXPENSE_LIMIT, balancesOf, minimalTransfers, parseExpense, type Transfer } from "../lib/expenses";
import { inMemberTrip, personColumns } from "./access";
import { TravelUserError } from "./errors";

// 所有成員都能記帳 改帳與結清 登入者是不是成員由 inMemberTrip 擋
// 成員離開後帳留著 只有刪除帳號才跟著外鍵刪

export type ExpenseInput = { title: string; amount: string; currency: string; rate: string; paidBy: string | null; shares: string[] };
export type TripExpense = { id: number; title: string; paidBy: string; amountCents: number; currency: string; rateMicros: number; shares: string[] };
export type TripSettlement = { id: number; fromUser: string; toUser: string; amountTwd: number };
export type TripMoney = { expenses: TripExpense[]; settlements: TripSettlement[] };

function parsed(input: ExpenseInput) {
  const result = parseExpense(input);
  if (!result.ok) throw new TravelUserError(result.error);
  const shares = [...new Set(input.shares)];
  if (shares.length === 0) throw new TravelUserError("請選要分這筆帳的人");
  if (!input.paidBy) throw new TravelUserError("請選付錢的人");
  return { values: result.value, paidBy: input.paidBy, shares };
}

/** 一個一個查 這段也會跑在交易裡 */
export async function readMoney(executor: Executor, tripId: number): Promise<TripMoney> {
  const rows = await executor.select().from(travelExpenses).where(eq(travelExpenses.tripId, tripId)).orderBy(asc(travelExpenses.id));
  const shares = await executor.select({ expenseId: travelExpenseShares.expenseId, userId: travelExpenseShares.userId }).from(travelExpenseShares).innerJoin(travelExpenses, eq(travelExpenseShares.expenseId, travelExpenses.id)).where(eq(travelExpenses.tripId, tripId));
  const settlements = await executor.select({ id: travelSettlements.id, fromUser: travelSettlements.fromUser, toUser: travelSettlements.toUser, amountTwd: travelSettlements.amountTwd }).from(travelSettlements).where(eq(travelSettlements.tripId, tripId)).orderBy(asc(travelSettlements.id));
  const expenses = rows.map(({ id, title, paidBy, amountCents, currency, rateMicros }) => ({ id, title, paidBy, amountCents, currency, rateMicros, shares: shares.filter((share) => share.expenseId === id).map((share) => share.userId) }));
  return { expenses, settlements };
}

/** 已經離開的人還留在帳上 名字另外讀 帳才看得懂 */
export async function formerPeople(executor: Executor, { expenses, settlements }: TripMoney, known: ReadonlySet<string>) {
  const ids = new Set([...expenses.flatMap(({ paidBy, shares }) => [paidBy, ...shares]), ...settlements.flatMap(({ fromUser, toUser }) => [fromUser, toUser])].filter((id) => !known.has(id)));
  return ids.size === 0 ? [] : executor.select(personColumns).from(coreUsers).where(inArray(coreUsers.id, [...ids]));
}

/** extra 是這筆帳本來就有的人 修改舊帳時已經離開的人不能被擋掉 */
async function assertPeople(executor: Executor, tripId: number, ids: readonly string[], extra: readonly string[] = []): Promise<void> {
  const members = await executor.select({ userId: travelMembers.userId }).from(travelMembers).where(eq(travelMembers.tripId, tripId));
  const allowed = new Set([...members.map(({ userId }) => userId), ...extra]);
  if (!ids.every((id) => allowed.has(id))) throw new TravelUserError("只能選同行的人，請重新整理頁面");
}

export async function addExpense(userId: string, tripId: number, input: ExpenseInput): Promise<{ expenseId: number; title: string }> {
  const { values, paidBy, shares } = parsed(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    const [{ expenses }] = await tx.select({ expenses: count() }).from(travelExpenses).where(eq(travelExpenses.tripId, tripId));
    if (expenses >= EXPENSE_LIMIT) throw new TravelUserError(`每趟旅程最多 ${EXPENSE_LIMIT} 筆帳`);
    await assertPeople(tx, tripId, [paidBy, ...shares]);
    const [{ id }] = await tx
      .insert(travelExpenses)
      .values({ tripId, paidBy, ...values })
      .returning({ id: travelExpenses.id });
    await tx.insert(travelExpenseShares).values(shares.map((share) => ({ expenseId: id, userId: share })));
    return { expenseId: id, title: values.title };
  });
}

export async function updateExpense(userId: string, tripId: number, expenseId: number, input: ExpenseInput): Promise<{ title: string }> {
  const { values, paidBy, shares } = parsed(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    const [expense] = await tx
      .select({ paidBy: travelExpenses.paidBy })
      .from(travelExpenses)
      .where(and(eq(travelExpenses.id, expenseId), eq(travelExpenses.tripId, tripId)));
    if (!expense) throw new TravelUserError("找不到這筆帳，可能已經被刪除");
    const current = await tx.select({ userId: travelExpenseShares.userId }).from(travelExpenseShares).where(eq(travelExpenseShares.expenseId, expenseId));
    await assertPeople(tx, tripId, [paidBy, ...shares], [expense.paidBy, ...current.map((share) => share.userId)]);
    await tx
      .update(travelExpenses)
      .set({ ...values, paidBy, updatedAt: new Date() })
      .where(eq(travelExpenses.id, expenseId));
    await tx.delete(travelExpenseShares).where(eq(travelExpenseShares.expenseId, expenseId));
    await tx.insert(travelExpenseShares).values(shares.map((share) => ({ expenseId, userId: share })));
    return { title: values.title };
  });
}

export async function deleteExpense(userId: string, tripId: number, expenseId: number): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    const deleted = await tx
      .delete(travelExpenses)
      .where(and(eq(travelExpenses.id, expenseId), eq(travelExpenses.tripId, tripId)))
      .returning({ id: travelExpenses.id });
    if (deleted.length === 0) throw new TravelUserError("找不到這筆帳，可能已經被刪除");
  });
}

/** 畫面可能是舊的 只收現在算出來真的該給的那一筆 不然帳會對不起來 */
export async function settleTransfer(userId: string, tripId: number, { from, to, amount }: Transfer): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    const { expenses, settlements } = await readMoney(tx, tripId);
    const current = minimalTransfers(balancesOf(expenses, settlements)).some((transfer) => transfer.from === from && transfer.to === to && transfer.amount === amount);
    if (!current) throw new TravelUserError("帳有變動，請重新整理頁面再看一次");
    await tx.insert(travelSettlements).values({ tripId, fromUser: from, toUser: to, amountTwd: amount });
  });
}

export async function undoSettlement(userId: string, tripId: number, settlementId: number): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    const deleted = await tx
      .delete(travelSettlements)
      .where(and(eq(travelSettlements.id, settlementId), eq(travelSettlements.tripId, tripId)))
      .returning({ id: travelSettlements.id });
    if (deleted.length === 0) throw new TravelUserError("找不到這筆結清紀錄，可能已經復原了");
  });
}
