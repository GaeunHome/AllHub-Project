import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { savingsHoldings, savingsTransactions, type SavingsHolding, type SavingsTransaction } from "../data/schema";
import { taipeiToday, type DateKey } from "../lib/dates";
import { removedCost, tradeNote } from "../lib/holdings";
import { MAX_SHARES } from "../lib/kinds";
import { MAX_AMOUNT } from "../lib/money";
import type { MonthKey } from "../lib/month";
import { monthToDate } from "../lib/month";
import type { Quote } from "../lib/quotes";
import { NOT_FOUND, SYMBOL_NOT_FOUND, isRowId, parseHoldingFields, parseHoldingUpdateFields, parseTradeFields, type TradeInput } from "../lib/validation";
import {
  DUPLICATE_HOLDING,
  HOLDING_COST_TOO_LARGE,
  HOLDING_NOT_INVESTMENT,
  NOT_ENOUGH_SHARES,
  QUOTES_UNAVAILABLE,
  SavingsUserError,
  TRADE_ACCOUNT_NOT_DEPOSIT,
} from "./errors";
import { findQuote } from "./quotes";
import { lockUser, nextSortOrder, ownAccounts, requireAccount, requireStarted, valid, withUniqueName, type AccountRef, type Executor } from "./shared";

// userId 一律是登入者 別人的 id 當作不存在
// 鎖的順序跟刪除帳號 帳戶 持股的連帶刪除一樣 使用者 帳戶 持股 再寫紀錄

/** 表單的原始字串 accountId 是投資帳戶 symbol 是台股代號 */
export type HoldingFields = { accountId: string; symbol: string; shares: string; cost: string };
/** 對帳用 直接改目前的股數與總成本 不產生紀錄 */
export type HoldingUpdateFields = { shares: string; cost: string };
/** fromAccountId 是扣款的存款帳戶 amount 是實際扣款 含手續費 */
export type BuyFields = { holdingId: string; fromAccountId: string; shares: string; amount: string; date: string; note: string };
/** toAccountId 是入帳的存款帳戶 amount 是實際入帳 */
export type SellFields = { holdingId: string; toAccountId: string; shares: string; amount: string; date: string; note: string };

export type TradeResult = { holding: SavingsHolding; transaction: SavingsTransaction };

/** 代號查不到時 complete 說兩個清單是不是都讀到了 */
export type QuoteLookup = (symbol: string) => Promise<{ quote: Quote } | { quote: null; complete: boolean }>;

const own = (userId: string, id: number) => and(eq(savingsHoldings.id, id), eq(savingsHoldings.userId, userId));

export async function listHoldings(userId: string): Promise<SavingsHolding[]> {
  return db()
    .select()
    .from(savingsHoldings)
    .where(eq(savingsHoldings.userId, userId))
    .orderBy(asc(savingsHoldings.accountId), asc(savingsHoldings.sortOrder), asc(savingsHoldings.id));
}

/** 名稱從股價清單抄 找不到代號或清單讀不到都不寫入 */
export async function addHolding(userId: string, fields: HoldingFields, lookup: QuoteLookup = (symbol) => findQuote(symbol)): Promise<SavingsHolding> {
  const input = valid(parseHoldingFields(fields));
  const account = requireAccount(await ownAccounts(db(), userId, [input.accountId]), input.accountId, true);
  if (account.kind !== "investment") throw new SavingsUserError(HOLDING_NOT_INVESTMENT);
  const found = await lookup(input.symbol);
  if (found.quote === null) throw new SavingsUserError(found.complete ? SYMBOL_NOT_FOUND : QUOTES_UNAVAILABLE);
  const [holding] = await withUniqueName(
    db()
      .insert(savingsHoldings)
      .values({
        userId,
        accountId: account.id,
        symbol: input.symbol,
        name: found.quote.name,
        shares: input.shares,
        cost: input.cost,
        sortOrder: nextSortOrder(savingsHoldings, eq(savingsHoldings.accountId, account.id)),
      })
      .returning(),
    DUPLICATE_HOLDING(input.symbol),
  );
  return holding;
}

/** 跟新增與買賣一樣 投資帳戶停用了就不能動 */
export async function updateHolding(userId: string, id: number, fields: HoldingUpdateFields): Promise<SavingsHolding> {
  if (!isRowId(id)) throw new SavingsUserError(NOT_FOUND.holding);
  const input = valid(parseHoldingUpdateFields(fields));
  const [found] = await db().select({ accountId: savingsHoldings.accountId }).from(savingsHoldings).where(own(userId, id));
  if (!found) throw new SavingsUserError(NOT_FOUND.holding);
  requireAccount(await ownAccounts(db(), userId, [found.accountId]), found.accountId, true);
  const [holding] = await db().update(savingsHoldings).set(input).where(own(userId, id)).returning();
  if (!holding) throw new SavingsUserError(NOT_FOUND.holding);
  return holding;
}

/** 定期定額跟著刪 買賣紀錄留著 holding_id 改成 null 回傳代號與名稱 找不到是 null */
export async function deleteHolding(userId: string, id: number): Promise<string | null> {
  if (!isRowId(id)) return null;
  const [deleted] = await db().delete(savingsHoldings).where(own(userId, id)).returning({ symbol: savingsHoldings.symbol, name: savingsHoldings.name });
  return deleted ? `${deleted.symbol} ${deleted.name}` : null;
}

/** 鎖住後讀的持股 別人的或刪掉的當作找不到 */
export async function lockOwnHolding(executor: Executor, userId: string, id: number): Promise<SavingsHolding> {
  const [holding] = await executor.select().from(savingsHoldings).where(own(userId, id)).for("update");
  if (!holding) throw new SavingsUserError(NOT_FOUND.holding);
  return holding;
}

/**
 * 買賣都在交易裡 先鎖使用者 再鎖存款與投資帳戶 最後鎖持股
 * 錢只在存款帳戶與這一檔所在的投資帳戶之間轉
 */
async function lockTrade(executor: Executor, userId: string, input: TradeInput): Promise<{ holding: SavingsHolding; cash: AccountRef; investment: AccountRef }> {
  const [found] = await executor.select({ accountId: savingsHoldings.accountId }).from(savingsHoldings).where(own(userId, input.holdingId));
  if (!found) throw new SavingsUserError(NOT_FOUND.holding);
  await lockUser(executor, userId);
  const accounts = await ownAccounts(executor, userId, [input.accountId, found.accountId], "share");
  const cash = requireAccount(accounts, input.accountId, true);
  if (cash.kind !== "deposit") throw new SavingsUserError(TRADE_ACCOUNT_NOT_DEPOSIT);
  const investment = requireAccount(accounts, found.accountId, true);
  const holding = await lockOwnHolding(executor, userId, input.holdingId);
  requireStarted(cash, input.date);
  requireStarted(investment, input.date);
  return { holding, cash, investment };
}

/** 確認定期定額時帶上是哪一條固定收支的哪一期 */
export type BuyRecord = { holding: SavingsHolding; cashAccountId: number; shares: number; amount: number; date: DateKey; note: string | null; recurring?: { ruleId: number; period: MonthKey } };

/**
 * 呼叫端已經照順序鎖好帳戶與持股
 * 寫一筆轉帳到投資帳戶 持股加上股數與成本 刪除紀錄時照 shares 與 cost_change 還原
 */
export async function recordBuy(executor: Executor, userId: string, buy: BuyRecord): Promise<TradeResult> {
  const shares = buy.holding.shares + buy.shares;
  if (shares > MAX_SHARES) throw new SavingsUserError("持股不能超過 10 億股");
  const cost = buy.holding.cost + buy.amount;
  if (cost > MAX_AMOUNT) throw new SavingsUserError(HOLDING_COST_TOO_LARGE);
  const [transaction] = await executor
    .insert(savingsTransactions)
    .values({
      userId,
      kind: "transfer",
      accountId: buy.cashAccountId,
      counterAccountId: buy.holding.accountId,
      amount: buy.amount,
      date: buy.date,
      note: buy.note ?? tradeNote("buy", buy.holding.symbol, buy.shares),
      holdingId: buy.holding.id,
      shares: buy.shares,
      costChange: buy.amount,
      recurringId: buy.recurring?.ruleId ?? null,
      recurringPeriod: buy.recurring ? monthToDate(buy.recurring.period) : null,
    })
    .returning();
  const [holding] = await executor.update(savingsHoldings).set({ shares, cost }).where(eq(savingsHoldings.id, buy.holding.id)).returning();
  return { holding, transaction };
}

export async function buyHolding(userId: string, fields: BuyFields, now = new Date()): Promise<TradeResult> {
  const input = valid(parseTradeFields({ ...fields, accountId: fields.fromAccountId }, "buy", taipeiToday(now)));
  return db().transaction(async (tx) => {
    const { holding, cash } = await lockTrade(tx, userId, input);
    return recordBuy(tx, userId, { holding, cashAccountId: cash.id, shares: input.shares, amount: input.amount, date: input.date, note: input.note });
  });
}

/** 移除的成本照平均成本 全部賣完就是全部成本 */
export async function sellHolding(userId: string, fields: SellFields, now = new Date()): Promise<TradeResult> {
  const input = valid(parseTradeFields({ ...fields, accountId: fields.toAccountId }, "sell", taipeiToday(now)));
  return db().transaction(async (tx) => {
    const { holding, cash, investment } = await lockTrade(tx, userId, input);
    if (input.shares > holding.shares) throw new SavingsUserError(NOT_ENOUGH_SHARES(holding.shares));
    const removed = removedCost(holding, input.shares);
    const [transaction] = await tx
      .insert(savingsTransactions)
      .values({
        userId,
        kind: "transfer",
        accountId: investment.id,
        counterAccountId: cash.id,
        amount: input.amount,
        date: input.date,
        note: input.note ?? tradeNote("sell", holding.symbol, input.shares),
        holdingId: holding.id,
        shares: -input.shares,
        costChange: -removed,
      })
      .returning();
    const [updated] = await tx
      .update(savingsHoldings)
      .set({ shares: holding.shares - input.shares, cost: holding.cost - removed })
      .where(eq(savingsHoldings.id, holding.id))
      .returning();
    return { holding: updated, transaction };
  });
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * 刪除買賣紀錄時把那一筆對持股的改變扣回來 呼叫端已經鎖住持股
 * 之後又改過股數或成本時可能扣成負的 夾在 0
 */
export async function revertTrade(executor: Executor, holding: SavingsHolding, record: Pick<SavingsTransaction, "shares" | "costChange">): Promise<void> {
  await executor
    .update(savingsHoldings)
    .set({ shares: clamp(holding.shares - (record.shares ?? 0), MAX_SHARES), cost: clamp(holding.cost - (record.costChange ?? 0), MAX_AMOUNT) })
    .where(eq(savingsHoldings.id, holding.id));
}
