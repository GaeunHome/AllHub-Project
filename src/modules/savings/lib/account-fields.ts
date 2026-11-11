import { fail, ok, type Parsed } from "@/core/parsed";
import { formatMonthDay, parseDate, type DateKey } from "./dates";
import { CARD_STYLES, LABEL_MAX_LENGTH, type AccountKind, type CardStyle } from "./kinds";
import { balanceFromFigure } from "./ledger";
import { NOT_FOUND, charCount, checked, labelled, normalizeName, oneOf, optional, optionalId, parseAmount, parseBalance, parseDay, parseName, parseRowId, type Fields } from "./validation";

// 帳戶與修改分配的表單 共用的金額 id 名稱檢查在 validation.ts

/** 帳戶的用途 例如生活費 跟名稱一樣正規化 空白是沒填 */
function parseLabel(raw: string): Parsed<string | null> {
  const label = normalizeName(raw);
  if (label === "") return ok(null);
  if (charCount(label) > LABEL_MAX_LENGTH) return fail(`用途最多 ${LABEL_MAX_LENGTH} 個字`);
  return ok(label);
}

/** 沒選時畫面照信用卡建立的順序輪流 */
function parseCardStyle(raw: string): Parsed<CardStyle | null> {
  const text = raw.trim();
  if (text === "") return ok(null);
  const style = oneOf(CARD_STYLES, text);
  return style ? ok(style) : fail("卡面顏色不正確");
}

export type AccountInput = {
  name: string;
  label: string | null;
  cardStyle: CardStyle | null;
  openingBalance: number;
  openingCost: number | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  payFromAccountId: number | null;
  statementDay: number | null;
  autopay: boolean;
};

// 跟表單的欄位名稱一樣 新增時填現在的數字 修改時改開始記帳時的數字
const OPENING_LABELS: Record<"create" | "update", Record<AccountKind, string>> = {
  create: { deposit: "起始餘額", investment: "目前市值", credit: "目前未繳" },
  update: { deposit: "起始餘額", investment: "起始市值", credit: "起始未繳" },
};

/**
 * 不適用這個類型的欄位當成 null 例如切換類型前填的
 * 信用卡填未繳 存成負的起始餘額 負的未繳是溢繳
 */
export function parseAccountFields(
  fields: Fields<"name" | "label" | "cardStyle" | "openingBalance" | "openingCost" | "monthlyPlan" | "targetAmount" | "payFromAccountId" | "statementDay" | "autopay">,
  kind: AccountKind,
  mode: "create" | "update" = "create",
): Parsed<AccountInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const label = parseLabel(fields.label);
  if (!label.ok) return label;
  const cardStyle = kind === "credit" ? parseCardStyle(fields.cardStyle) : ok(null);
  if (!cardStyle.ok) return cardStyle;
  const opening = labelled(OPENING_LABELS[mode][kind], fields.openingBalance.trim() === "" ? ok(0) : parseBalance(fields.openingBalance, { allowNegative: kind === "credit" }));
  if (!opening.ok) return opening;
  const openingCost = kind === "investment" ? labelled("成本", optional(fields.openingCost, parseBalance)) : ok(null);
  if (!openingCost.ok) return openingCost;
  const monthlyPlan = kind === "credit" ? ok(null) : labelled("每月規劃", optional(fields.monthlyPlan, parseAmount));
  if (!monthlyPlan.ok) return monthlyPlan;
  const targetAmount = kind === "credit" ? ok(null) : labelled("目標金額", optional(fields.targetAmount, parseAmount));
  if (!targetAmount.ok) return targetAmount;
  const statementDay = kind === "credit" && fields.statementDay.trim() !== "" ? parseDay(fields.statementDay, "結帳日要在 1 到 31 日之間") : ok(null);
  if (!statementDay.ok) return statementDay;
  const payFromAccountId = kind === "credit" ? optionalId(fields.payFromAccountId, NOT_FOUND.account) : ok(null);
  if (!payFromAccountId.ok) return payFromAccountId;
  return ok({
    name: name.value,
    // 信用卡的表單沒有用途
    label: kind === "credit" ? null : label.value,
    cardStyle: cardStyle.value,
    openingBalance: balanceFromFigure(kind, opening.value),
    openingCost: openingCost.value,
    monthlyPlan: monthlyPlan.value,
    targetAmount: targetAmount.value,
    payFromAccountId: payFromAccountId.value,
    statementDay: statementDay.value,
    autopay: kind === "credit" && checked(fields.autopay),
  });
}

/**
 * 可以選過去的日期 才能補記之前的收支 today 要用台北時間
 * 空的是部署時還開著的舊畫面沒有這一欄
 */
export function parseStartDate(raw: string, today: DateKey): Parsed<DateKey | null> {
  const text = raw.trim();
  if (text === "") return ok(null);
  const date = parseDate(text);
  if (date === null) return fail("開始記帳日不正確");
  if (date > today) return fail("開始記帳日不能是未來的日期");
  return ok(date);
}

/** 開始記帳日往後改時不能留下更早的紀錄 earliest 是這個帳戶最早的紀錄 */
export function checkStartBeforeRecords(startDate: DateKey, earliest: DateKey | null): Parsed<DateKey> {
  return earliest === null || earliest >= startDate ? ok(startDate) : fail(`這個帳戶最早的紀錄在 ${formatMonthDay(earliest, startDate)}，開始記帳日不能更晚`);
}

/** 別人的帳戶 信用卡或格式不對的 id 修改分配時整批不寫 */
export const ALLOCATION_ACCOUNT_INVALID = "找不到帳戶，請重新整理頁面";

export type AllocationInput = { accountId: number; monthlyPlan: number | null; targetAmount: number | null };

/**
 * 修改分配 一個帳戶一組 空白是不設
 * accountNames 是自己全部的帳戶 用來限制行數與在錯誤裡寫出帳戶名稱
 */
export function parseAllocationFields(lines: Fields<"accountId" | "monthlyPlan" | "targetAmount">[], accountNames?: ReadonlyMap<number, string>): Parsed<AllocationInput[]> {
  if (lines.length === 0 || (accountNames !== undefined && lines.length > accountNames.size)) return fail(ALLOCATION_ACCOUNT_INVALID);
  const parsed: AllocationInput[] = [];
  for (const line of lines) {
    const accountId = parseRowId(line.accountId);
    if (accountId === null || parsed.some((row) => row.accountId === accountId)) return fail(ALLOCATION_ACCOUNT_INVALID);
    const name = accountNames?.get(accountId);
    const field = (label: string) => (name === undefined ? label : `「${name}」的${label}`);
    const monthlyPlan = labelled(field("每月規劃"), optional(line.monthlyPlan, parseAmount));
    if (!monthlyPlan.ok) return monthlyPlan;
    const targetAmount = labelled(field("目標金額"), optional(line.targetAmount, parseAmount));
    if (!targetAmount.ok) return targetAmount;
    parsed.push({ accountId, monthlyPlan: monthlyPlan.value, targetAmount: targetAmount.value });
  }
  return ok(parsed);
}
