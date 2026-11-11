import { fail, ok, type Parsed } from "@/core/parsed";
import type { DateKey } from "./dates";
import { normalizeSymbol } from "./quotes";
import { NOT_FOUND, labelled, parseAmount, parseBalance, parseEntryDate, parseNote, parseRowId, parseShares, requiredId, type Fields } from "./validation";

// 持股與買進賣出的表單

export const SYMBOL_NOT_FOUND = "找不到這個代號：只支援台股上市櫃股票與 ETF";

export type HoldingInput = { accountId: number; symbol: string; shares: number; cost: number };

/** 照券商 App 庫存頁的目前股數與總成本 都可以是 0 */
export function parseHoldingFields(fields: Fields<"accountId" | "symbol" | "shares" | "cost">): Parsed<HoldingInput> {
  const accountId = requiredId(fields.accountId, "請選擇投資帳戶", NOT_FOUND.account);
  if (!accountId.ok) return accountId;
  if (fields.symbol.trim() === "") return fail("請輸入股票代號");
  const symbol = normalizeSymbol(fields.symbol);
  if (symbol === null) return fail(SYMBOL_NOT_FOUND);
  const update = parseHoldingUpdateFields(fields);
  if (!update.ok) return update;
  return ok({ accountId: accountId.value, symbol, ...update.value });
}

export type HoldingUpdateInput = { shares: number; cost: number };

export function parseHoldingUpdateFields(fields: Fields<"shares" | "cost">): Parsed<HoldingUpdateInput> {
  const shares = labelled("目前股數", parseShares(fields.shares, { allowZero: true }));
  if (!shares.ok) return shares;
  const cost = labelled("總成本", parseBalance(fields.cost));
  if (!cost.ok) return cost;
  return ok({ shares: shares.value, cost: cost.value });
}

/** accountId 買進是扣款的帳戶 賣出是入帳的帳戶 amount 是實際扣款或入帳 含手續費 */
export type TradeInput = { holdingId: number; accountId: number; shares: number; amount: number; date: DateKey; note: string | null };

export function parseTradeFields(fields: Fields<"holdingId" | "accountId" | "shares" | "amount" | "date" | "note">, side: "buy" | "sell", today: DateKey): Parsed<TradeInput> {
  const holdingId = parseRowId(fields.holdingId);
  if (holdingId === null) return fail(NOT_FOUND.holding);
  const accountId = requiredId(fields.accountId, side === "buy" ? "請選擇扣款的帳戶" : "請選擇入帳的帳戶", NOT_FOUND.account);
  if (!accountId.ok) return accountId;
  const shares = parseShares(fields.shares);
  if (!shares.ok) return shares;
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  const note = parseNote(fields.note);
  if (!note.ok) return note;
  return ok({ holdingId, accountId: accountId.value, shares: shares.value, amount: amount.value, date: date.value, note: note.value });
}
