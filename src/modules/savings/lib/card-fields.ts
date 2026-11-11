import { fail, ok, type Parsed } from "@/core/parsed";
import { MAX_DUE_DAYS } from "./cards";
import { addDays, formatMonthDay, parseDate, type DateKey } from "./dates";
import { NOT_FOUND, SAME_ACCOUNT, labelled, optionalId, parseAmount, parseBalance, parseEntryDate, parseRowId, requiredId, type Fields } from "./validation";

// 信用卡的填帳單與已繳的表單

/** billAmount 與 dueDate 是一起填這一期的帳單 沒填是 null categoryId 是補記的刷卡的分類 */
export type PayCardInput = { cardId: number; fromAccountId: number; amount: number; date: DateKey; billAmount: number | null; dueDate: DateKey | null; categoryId: number | null };

// 帳單照銀行的 繳清或沒有消費時是 0
const parseBillAmount = (raw: string) => labelled("帳單金額", parseBalance(raw));

// 照帳單填的截止日 早晚的範圍要等知道是哪一期才看
function parseDueDate(raw: string): Parsed<DateKey> {
  const text = raw.trim();
  if (text === "") return fail("請輸入繳款截止日");
  const date = parseDate(text);
  return date === null ? fail("繳款截止日不正確") : ok(date);
}

/** 截止日不會早於結帳日 超過結帳後 60 天多半是打錯月份或年份 */
export function checkBillDueDate(statementDate: DateKey, dueDate: DateKey): Parsed<DateKey> {
  if (dueDate < statementDate) return fail(`繳款截止日不能早於結帳日（${formatMonthDay(statementDate, dueDate)}）`);
  const latest = addDays(statementDate, MAX_DUE_DAYS);
  if (dueDate > latest) return fail(`繳款截止日最晚是結帳後 ${MAX_DUE_DAYS} 天（${formatMonthDay(latest, dueDate)}）`);
  return ok(dueDate);
}

export function parsePayCardFields(fields: Fields<"cardId" | "fromAccountId" | "amount" | "date"> & { billAmount?: string; dueDate?: string; categoryId?: string }, today: DateKey): Parsed<PayCardInput> {
  const cardId = parseRowId(fields.cardId);
  if (cardId === null) return fail(NOT_FOUND.account);
  const fromAccountId = requiredId(fields.fromAccountId, "請選擇扣款的帳戶", NOT_FOUND.account);
  if (!fromAccountId.ok) return fromAccountId;
  if (fromAccountId.value === cardId) return fail(SAME_ACCOUNT);
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  const billAmount = (fields.billAmount ?? "").trim() === "" ? ok(null) : parseBillAmount(fields.billAmount ?? "");
  if (!billAmount.ok) return billAmount;
  // 只繳款時沒有帳單 不看截止日
  const dueDate = billAmount.value === null ? ok(null) : parseDueDate(fields.dueDate ?? "");
  if (!dueDate.ok) return dueDate;
  const categoryId = optionalId(fields.categoryId ?? "", NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  return ok({ cardId, fromAccountId: fromAccountId.value, amount: amount.value, date: date.value, billAmount: billAmount.value, dueDate: dueDate.value, categoryId: categoryId.value });
}

/** statementDate 沒填是這一期 dueDate 照帳單填的存 categoryId 是補記的刷卡記在哪個支出分類 */
export type CardBillInput = { cardId: number; amount: number; statementDate: DateKey | null; dueDate: DateKey; categoryId: number | null };

export function parseCardBillFields(fields: Fields<"cardId" | "amount" | "statementDate" | "dueDate" | "categoryId">, today: DateKey): Parsed<CardBillInput> {
  const cardId = parseRowId(fields.cardId);
  if (cardId === null) return fail(NOT_FOUND.account);
  const amount = parseBillAmount(fields.amount);
  if (!amount.ok) return amount;
  const statementDate = fields.statementDate.trim() === "" ? ok(null) : labelled("結帳日", parseEntryDate(fields.statementDate, today));
  if (!statementDate.ok) return statementDate;
  const dueDate = parseDueDate(fields.dueDate);
  if (!dueDate.ok) return dueDate;
  const categoryId = optionalId(fields.categoryId, NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  return ok({ cardId, amount: amount.value, statementDate: statementDate.value, dueDate: dueDate.value, categoryId: categoryId.value });
}
