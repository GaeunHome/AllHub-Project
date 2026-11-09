import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { valueOrThrow } from "@/core/parsed";
import type { Executor } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { travelExpensePayers, travelExpenses, travelExpenseShares, travelMembers, travelSettlements } from "../data/schema";
import { EXPENSE_LIMIT, balancesOf, minimalTransfers, parseExpense, parsePayers, parseRepayment, parseShares, type ExpenseCategory, type Payment, type Share, type SplitMode, type Transfer } from "../lib/expenses";
import { inMemberTrip, personColumns } from "./access";
import { TravelUserError } from "./errors";

// 所有成員都能記帳 改帳與結清 登入者是不是成員由 inMemberTrip 擋
// 成員離開後帳留著 只有刪除帳號才跟著外鍵刪

/** paid 是好幾個人付時每人填的 portions 是照金額或照比例時每人填的 key 都是使用者 id */
export type ExpenseInput = {
  title: string;
  amount: string;
  currency: string;
  rate: string;
  spentOn: string;
  category: string;
  paidBy: string | null;
  manyPayers: boolean;
  paid: Record<string, string>;
  split: string;
  shares: string[];
  portions: Record<string, string>;
};
/** payers 一定有 一個人付的帳是 paid_by 付整筆 */
export type TripExpense = {
  id: number;
  title: string;
  paidBy: string;
  amountCents: number;
  currency: string;
  rateMicros: number;
  spentOn: string | null;
  category: ExpenseCategory | null;
  split: SplitMode;
  payers: Payment[];
  shares: Share[];
};
export type TripSettlement = { id: number; fromUser: string; toUser: string; amountTwd: number };
export type TripMoney = { expenses: TripExpense[]; settlements: TripSettlement[] };

function parsed(input: ExpenseInput) {
  const values = valueOrThrow(parseExpense(input), TravelUserError);
  const payers = valueOrThrow(parsePayers({ many: input.manyPayers, paidBy: input.paidBy ?? "", amounts: input.paid }, values.amountCents), TravelUserError);
  const { split, shares } = valueOrThrow(parseShares({ split: input.split, checked: input.shares, portions: input.portions }, values.amountCents), TravelUserError);
  // 舊程式只看 paid_by 寫付最多的人 一樣多時照 id 順序
  const paidBy = payers.toSorted((a, b) => b.amountCents - a.amountCents || (a.userId < b.userId ? -1 : 1))[0].userId;
  return { values: { ...values, split, paidBy }, payers, shares, people: [...payers.map(({ userId }) => userId), ...shares.map(({ userId }) => userId)] };
}

/** 一個人付時不寫付款列 舊程式寫的帳也是這樣 */
async function writeParts(tx: Executor, expenseId: number, payers: readonly Payment[], shares: readonly Share[]): Promise<void> {
  await tx.insert(travelExpenseShares).values(shares.map(({ userId, weight }) => ({ expenseId, userId, weight })));
  if (payers.length > 1) await tx.insert(travelExpensePayers).values(payers.map(({ userId, amountCents }) => ({ expenseId, userId, amountCents })));
}

const ledgerPeople = ({ expenses, settlements }: TripMoney): string[] => [
  ...expenses.flatMap(({ payers, shares }) => [...payers.map(({ userId }) => userId), ...shares.map(({ userId }) => userId)]),
  ...settlements.flatMap(({ fromUser, toUser }) => [fromUser, toUser]),
];

/** 一個一個查 這段也會跑在交易裡 */
export async function readMoney(executor: Executor, tripId: number): Promise<TripMoney> {
  const rows = await executor.select().from(travelExpenses).where(eq(travelExpenses.tripId, tripId)).orderBy(asc(travelExpenses.id));
  const shares = await executor
    .select({ expenseId: travelExpenseShares.expenseId, userId: travelExpenseShares.userId, weight: travelExpenseShares.weight })
    .from(travelExpenseShares)
    .innerJoin(travelExpenses, eq(travelExpenseShares.expenseId, travelExpenses.id))
    .where(eq(travelExpenses.tripId, tripId));
  const payers = await executor
    .select({ expenseId: travelExpensePayers.expenseId, userId: travelExpensePayers.userId, amountCents: travelExpensePayers.amountCents })
    .from(travelExpensePayers)
    .innerJoin(travelExpenses, eq(travelExpensePayers.expenseId, travelExpenses.id))
    .where(eq(travelExpenses.tripId, tripId));
  const settlements = await executor.select({ id: travelSettlements.id, fromUser: travelSettlements.fromUser, toUser: travelSettlements.toUser, amountTwd: travelSettlements.amountTwd }).from(travelSettlements).where(eq(travelSettlements.tripId, tripId)).orderBy(asc(travelSettlements.id));
  const expenses = rows.map(({ id, title, paidBy, amountCents, currency, rateMicros, spentOn, category, split }): TripExpense => {
    const paid = payers.filter((payer) => payer.expenseId === id).map(({ userId, amountCents }) => ({ userId, amountCents }));
    return {
      id,
      title,
      paidBy,
      amountCents,
      currency,
      rateMicros,
      spentOn,
      category,
      split,
      payers: paid.length > 0 ? paid : [{ userId: paidBy, amountCents }],
      shares: shares.filter((share) => share.expenseId === id).map(({ userId, weight }) => ({ userId, weight })),
    };
  });
  return { expenses, settlements };
}

/** 已經離開的人還留在帳上 名字另外讀 帳才看得懂 */
export async function formerPeople(executor: Executor, money: TripMoney, known: ReadonlySet<string>) {
  const ids = new Set(ledgerPeople(money).filter((id) => !known.has(id)));
  return ids.size === 0 ? [] : executor.select(personColumns).from(coreUsers).where(inArray(coreUsers.id, [...ids]));
}

/** extra 是這筆帳本來就有的人 修改舊帳時已經離開的人不能被擋掉 */
async function assertPeople(executor: Executor, tripId: number, ids: readonly string[], extra: readonly string[] = []): Promise<void> {
  const members = await executor.select({ userId: travelMembers.userId }).from(travelMembers).where(eq(travelMembers.tripId, tripId));
  const allowed = new Set([...members.map(({ userId }) => userId), ...extra]);
  if (!ids.every((id) => allowed.has(id))) throw new TravelUserError("只能選同行的人，請重新整理頁面");
}

export async function addExpense(userId: string, tripId: number, input: ExpenseInput): Promise<{ expenseId: number; title: string }> {
  const { values, payers, shares, people } = parsed(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    const [{ expenses }] = await tx.select({ expenses: count() }).from(travelExpenses).where(eq(travelExpenses.tripId, tripId));
    if (expenses >= EXPENSE_LIMIT) throw new TravelUserError(`每趟旅程最多 ${EXPENSE_LIMIT} 筆帳`);
    await assertPeople(tx, tripId, people);
    const [{ id }] = await tx
      .insert(travelExpenses)
      .values({ tripId, ...values })
      .returning({ id: travelExpenses.id });
    await writeParts(tx, id, payers, shares);
    return { expenseId: id, title: values.title };
  });
}

export async function updateExpense(userId: string, tripId: number, expenseId: number, input: ExpenseInput): Promise<{ title: string }> {
  const { values, payers, shares, people } = parsed(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    const [expense] = await tx
      .select({ paidBy: travelExpenses.paidBy })
      .from(travelExpenses)
      .where(and(eq(travelExpenses.id, expenseId), eq(travelExpenses.tripId, tripId)));
    if (!expense) throw new TravelUserError("找不到這筆帳，可能已經被刪除");
    const currentShares = await tx.select({ userId: travelExpenseShares.userId }).from(travelExpenseShares).where(eq(travelExpenseShares.expenseId, expenseId));
    const currentPayers = await tx.select({ userId: travelExpensePayers.userId }).from(travelExpensePayers).where(eq(travelExpensePayers.expenseId, expenseId));
    await assertPeople(tx, tripId, people, [expense.paidBy, ...currentShares.map((row) => row.userId), ...currentPayers.map((row) => row.userId)]);
    await tx
      .update(travelExpenses)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(travelExpenses.id, expenseId));
    await tx.delete(travelExpenseShares).where(eq(travelExpenseShares.expenseId, expenseId));
    await tx.delete(travelExpensePayers).where(eq(travelExpensePayers.expenseId, expenseId));
    await writeParts(tx, expenseId, payers, shares);
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

/** 任意金額的還款 已經離開 還留在帳上的人也可以 */
export async function recordRepayment(userId: string, tripId: number, input: { from: string; to: string; amount: string }): Promise<void> {
  const { from, to, amountTwd } = valueOrThrow(parseRepayment(input), TravelUserError);
  await inMemberTrip(userId, tripId, async (tx) => {
    await assertPeople(tx, tripId, [from, to], ledgerPeople(await readMoney(tx, tripId)));
    await tx.insert(travelSettlements).values({ tripId, fromUser: from, toUser: to, amountTwd });
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
