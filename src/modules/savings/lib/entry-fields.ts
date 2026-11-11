import { fail, ok, type Parsed } from "@/core/parsed";
import type { DateKey } from "./dates";
import { ENTRY_KINDS, type EntryKind } from "./kinds";
import { NOT_FOUND, SAME_ACCOUNT, oneOf, optionalId, parseAmount, parseBalance, parseEntryDate, parseNote, parseRowId, requiredId, type Fields } from "./validation";

// 記一筆與更新餘額的表單 固定收支也用這裡的收支轉帳檢查

export type EntryCore = { kind: EntryKind; accountId: number; counterAccountId: number | null; categoryId: number | null; amount: number; note: string | null };

/**
 * 紀錄與固定收支共用 轉帳要有另一個轉入帳戶 不能有分類
 * 收支忽略轉入帳戶 分類可以留空當未分類
 */
export function parseEntryCore(fields: Fields<"kind" | "accountId" | "counterAccountId" | "categoryId" | "amount" | "note">, { counterFromHolding = false } = {}): Parsed<EntryCore> {
  const kind = oneOf(ENTRY_KINDS, fields.kind);
  if (!kind) return fail("類型不正確");
  const accountId = requiredId(fields.accountId, "請選擇帳戶", NOT_FOUND.account);
  if (!accountId.ok) return accountId;
  const counterAccountId = kind === "transfer" && !counterFromHolding ? requiredId(fields.counterAccountId, "請選擇轉入的帳戶", NOT_FOUND.account) : ok(null);
  if (!counterAccountId.ok) return counterAccountId;
  if (counterAccountId.value === accountId.value) return fail(SAME_ACCOUNT);
  const categoryId = kind === "transfer" ? ok(null) : optionalId(fields.categoryId, NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const note = parseNote(fields.note);
  if (!note.ok) return note;
  return ok({ kind, accountId: accountId.value, counterAccountId: counterAccountId.value, categoryId: categoryId.value, amount: amount.value, note: note.value });
}

export type EntryInput = EntryCore & { date: DateKey };

export function parseEntryFields(fields: Fields<"kind" | "accountId" | "counterAccountId" | "categoryId" | "amount" | "date" | "note">, today: DateKey): Parsed<EntryInput> {
  const core = parseEntryCore(fields);
  if (!core.ok) return core;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  return ok({ ...core.value, date: date.value });
}

export type BalanceInput = { accountId: number; actual: number };

/** actual 是銀行或券商 App 上的數字 存款與投資都不會是負的 */
export function parseBalanceFields(fields: Fields<"accountId" | "actual">): Parsed<BalanceInput> {
  const accountId = parseRowId(fields.accountId);
  if (accountId === null) return fail(NOT_FOUND.account);
  const actual = parseBalance(fields.actual);
  if (!actual.ok) return actual;
  return ok({ accountId, actual: actual.value });
}
