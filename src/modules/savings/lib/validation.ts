import { MAX_AMOUNT } from "./money";
import { parseMonth, type MonthKey } from "./month";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const NAME_MAX_LENGTH = 30;
export const NOTE_MAX_LENGTH = 200;

// 只收新台幣整數元；千分位逗號要放在正確位置，才不會把 5,00 當成 500
const AMOUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;

export function parseAmount(raw: string): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "請輸入金額" };
  if (!AMOUNT_PATTERN.test(text)) return { ok: false, error: "金額只能是正整數（單位：元，不能有小數或負數）" };
  const value = Number(text.replaceAll(",", ""));
  if (value < 1) return { ok: false, error: "金額至少 1 元" };
  if (value > MAX_AMOUNT) return { ok: false, error: "金額不能超過 1 億元" };
  return { ok: true, value };
}

// 用 code point 算字數，emoji 才不會被算成兩個字
const charCount = (text: string) => [...text].length;

function parseName(raw: string): Parsed<string> {
  const name = raw.trim();
  if (name === "") return { ok: false, error: "請輸入項目名稱" };
  if (charCount(name) > NAME_MAX_LENGTH) return { ok: false, error: `名稱最多 ${NAME_MAX_LENGTH} 個字` };
  return { ok: true, value: name };
}

function parseNote(raw: string): Parsed<string | null> {
  const note = raw.trim();
  if (charCount(note) > NOTE_MAX_LENGTH) return { ok: false, error: `備註最多 ${NOTE_MAX_LENGTH} 個字` };
  return { ok: true, value: note === "" ? null : note };
}

export type GoalFields = { name: string; monthlyAmount: string; note: string };
export type GoalInput = { name: string; monthlyAmount: number; note: string | null };

export function parseGoalFields(fields: GoalFields): Parsed<GoalInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const monthlyAmount = parseAmount(fields.monthlyAmount);
  if (!monthlyAmount.ok) return monthlyAmount;
  const note = parseNote(fields.note);
  if (!note.ok) return note;
  return { ok: true, value: { name: name.value, monthlyAmount: monthlyAmount.value, note: note.value } };
}

export type EntryFields = { month: string; amount: string; note: string };
export type EntryInput = { month: MonthKey; amount: number; note: string | null };

export function parseEntryFields(fields: EntryFields, currentMonth: MonthKey): Parsed<EntryInput> {
  const month = parseMonth(fields.month);
  if (month === null) return { ok: false, error: "月份不正確" };
  if (month > currentMonth) return { ok: false, error: "不能記錄未來的月份" };
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const note = parseNote(fields.note);
  if (!note.ok) return note;
  return { ok: true, value: { month, amount: amount.value, note: note.value } };
}
