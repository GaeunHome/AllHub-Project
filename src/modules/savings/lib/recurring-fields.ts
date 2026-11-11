import { fail, ok, type Parsed } from "@/core/parsed";
import type { DateKey } from "./dates";
import { parseEntryCore, type EntryCore } from "./entry-fields";
import { HOLIDAY_RULES, INTERVAL_MONTHS, RECURRING_MODES, type HolidayRule, type IntervalMonths, type RecurringMode } from "./kinds";
import { monthToDate, type MonthKey } from "./month";
import { NOT_FOUND, PERIOD_INVALID, checked, labelled, oneOf, parseAmount, parseDay, parseEntryDate, parseName, parseNote, parsePeriod, parseRowId, parseShares, requiredId, type Fields } from "./validation";

// 固定收支的表單 與確認或略過待處理的一期

/** 定期定額要股數 薪水要實際金額 自動記帳記不出來 */
export const REGULAR_BUY_NEEDS_CONFIRM = "定期定額要確認股數，只能選『到期請我確認』";
export const SALARY_NEEDS_CONFIRM = "薪水要確認實際金額，只能選『到期請我確認』";

/**
 * startMonth 存那個月的 1 號 每月一次是 null
 * 定期定額的轉入帳戶由 service 照那一檔填
 */
export type RecurringInput = EntryCore & {
  dayOfMonth: number;
  name: string | null;
  intervalMonths: IntervalMonths;
  startMonth: string | null;
  holidayRule: HolidayRule;
  mode: RecurringMode;
  holdingId: number | null;
  allocate: boolean;
  subscription: boolean;
};

export type RecurringFieldName =
  | "kind"
  | "accountId"
  | "counterAccountId"
  | "categoryId"
  | "amount"
  | "dayOfMonth"
  | "note"
  | "name"
  | "intervalMonths"
  | "startMonth"
  | "holidayRule"
  | "mode"
  | "holdingId"
  | "allocate"
  | "subscription";

function parseInterval(raw: string): Parsed<IntervalMonths> {
  const text = raw.trim();
  if (text === "") return ok(1);
  const interval = INTERVAL_MONTHS.find((value) => String(value) === text);
  return interval === undefined ? fail("多久一次不正確") : ok(interval);
}

/**
 * regular 或帶 holdingId 的 transfer 是定期定額 一定要選一檔
 * 空白的間隔 假日規則與記帳方式是每月 照原日 到期確認
 */
export function parseRecurringFields(fields: Fields<RecurringFieldName>): Parsed<RecurringInput> {
  const regular = fields.kind === "regular" || (fields.kind === "transfer" && fields.holdingId.trim() !== "");
  const holdingId = regular ? requiredId(fields.holdingId, "請選擇要買哪一檔", NOT_FOUND.holding) : ok(null);
  if (!holdingId.ok) return holdingId;
  // 定期定額的轉入帳戶跟著那一檔走 不看表單送來的
  const core = parseEntryCore(regular ? { ...fields, kind: "transfer" } : fields, { counterFromHolding: regular });
  if (!core.ok) return core;
  const dayOfMonth = parseDay(fields.dayOfMonth, "每月的日期要在 1 到 31 日之間");
  if (!dayOfMonth.ok) return dayOfMonth;
  const name = fields.name.trim() === "" ? ok(null) : parseName(fields.name);
  if (!name.ok) return name;
  const intervalMonths = parseInterval(fields.intervalMonths);
  if (!intervalMonths.ok) return intervalMonths;
  const startMonth = intervalMonths.value === 1 || fields.startMonth.trim() === "" ? null : parsePeriod(fields.startMonth);
  if (startMonth === null && intervalMonths.value !== 1 && fields.startMonth.trim() !== "") return fail("從哪個月開始不正確");
  const holidayRule = fields.holidayRule.trim() === "" ? "none" : oneOf(HOLIDAY_RULES, fields.holidayRule);
  if (!holidayRule) return fail("遇假日的處理方式不正確");
  const mode = fields.mode.trim() === "" ? "confirm" : oneOf(RECURRING_MODES, fields.mode);
  if (!mode) return fail("記帳方式不正確");
  const allocate = core.value.kind === "income" && checked(fields.allocate);
  if (regular && mode === "auto") return fail(REGULAR_BUY_NEEDS_CONFIRM);
  if (allocate && mode === "auto") return fail(SALARY_NEEDS_CONFIRM);
  return ok({
    ...core.value,
    dayOfMonth: dayOfMonth.value,
    name: name.value,
    intervalMonths: intervalMonths.value,
    startMonth: startMonth === null ? null : monthToDate(startMonth),
    holidayRule,
    mode,
    holdingId: holdingId.value,
    allocate,
    subscription: core.value.kind === "expense" && checked(fields.subscription),
  });
}

/** 確認待處理的一期 金額可以跟預計的不同 shares 只有定期定額要 */
export type ConfirmInput = { ruleId: number; period: MonthKey; amount: number; date: DateKey; note: string | null; shares: number | null };

export function parseConfirmFields(fields: Fields<"ruleId" | "period" | "amount" | "date" | "note" | "shares">, today: DateKey): Parsed<ConfirmInput> {
  const occurrence = parseOccurrenceFields(fields);
  if (!occurrence.ok) return occurrence;
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  const note = parseNote(fields.note);
  if (!note.ok) return note;
  const shares = fields.shares.trim() === "" ? ok(null) : labelled("股數", parseShares(fields.shares));
  if (!shares.ok) return shares;
  return ok({ ...occurrence.value, amount: amount.value, date: date.value, note: note.value, shares: shares.value });
}

export type OccurrenceInput = { ruleId: number; period: MonthKey };

export function parseOccurrenceFields(fields: Fields<"ruleId" | "period">): Parsed<OccurrenceInput> {
  const ruleId = parseRowId(fields.ruleId);
  if (ruleId === null) return fail(NOT_FOUND.recurring);
  const period = parsePeriod(fields.period);
  if (period === null) return fail(PERIOD_INVALID);
  return ok({ ruleId, period });
}
