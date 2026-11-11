import { fail, ok, type Parsed } from "@/core/parsed";
import { formatMonthDay, parseDate, type DateKey } from "./dates";
import { ACCOUNT_KINDS, CATEGORY_KINDS, MAX_SHARES, NAME_MAX_LENGTH, NOTE_MAX_LENGTH, type AccountKind, type CategoryKind } from "./kinds";
import { accountStartDate, type AccountLike } from "./ledger";
import { MAX_AMOUNT } from "./money";
import { parseMonth, type MonthKey } from "./month";

// 各表單共用的基本檢查 把表單的字串解析成資料表的值 id 是不是自己的由 service 查資料庫確認
// 各表單自己的在同資料夾的 *-fields.ts

/** 別人的 刪掉的或格式不對的 id 都用同一句 不透露那筆資料存不存在 */
export const NOT_FOUND = {
  account: "找不到這個帳戶，可能已經刪除了",
  category: "找不到這個分類，可能已經刪除了",
  transaction: "找不到這筆紀錄，可能已經刪除了",
  recurring: "找不到這個固定收支，可能已經刪除了",
  holding: "找不到這一檔持股，可能已經刪除了",
} as const;

// 期別是隱藏欄位 格式不對就是表單被改過或畫面太舊
export const PERIOD_INVALID = "這一期的資料不正確，請重新整理頁面再試一次";

export const SAME_ACCOUNT = "轉出和轉入不能是同一個帳戶";

// 只收整數元 千分位逗號要在正確位置 才不會把 5,00 當成 500
const AMOUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;

type AmountOptions = { allowNegative?: boolean };

/** text 已去掉前後空白 格式不對回 null 範圍由呼叫端判斷 */
function integerValue(text: string, allowNegative: boolean): number | null {
  const negative = allowNegative && text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  if (!AMOUNT_PATTERN.test(digits)) return null;
  const value = Number(digits.replaceAll(",", ""));
  // 寫成 -value 的話 0 會變成 -0
  return negative ? 0 - value : value;
}

/**
 * 瀏覽器試算用 規則跟 parseAmount 與 parseBalance 同一套
 * 只認不超過 1 億的整數元 包含 0 其他回 null
 */
export function amountFromText(raw: string, options: AmountOptions = {}): number | null {
  const value = integerValue(raw.trim(), options.allowNegative ?? false);
  return value !== null && Math.abs(value) <= MAX_AMOUNT ? value : null;
}

export function parseAmount(raw: string): Parsed<number> {
  const text = raw.trim();
  if (text === "") return fail("請輸入金額");
  const value = integerValue(text, false);
  if (value === null) return fail("金額只能是正整數（單位：元，不能有小數或負數）");
  if (value < 1) return fail("金額至少 1 元");
  if (value > MAX_AMOUNT) return fail("金額不能超過 1 億元");
  return ok(value);
}

/** 餘額 市值 未繳 成本都可以是 0 allowNegative 只給信用卡的溢繳用 */
export function parseBalance(raw: string, options: AmountOptions = {}): Parsed<number> {
  const text = raw.trim();
  const allowNegative = options.allowNegative ?? false;
  if (text === "") return fail("請輸入金額");
  const value = integerValue(text, allowNegative);
  if (value === null) return fail(allowNegative ? "金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）" : "金額只能是整數（單位：元，不能有小數或負數）");
  if (value > MAX_AMOUNT) return fail("金額不能超過 1 億元");
  if (value < -MAX_AMOUNT) return fail("溢繳不能超過 1 億元");
  return ok(value);
}

/** 股數只收整數 台股最小單位是 1 股 allowZero 給目前股數用 例如還沒開始定期定額 */
export function parseShares(raw: string, options: { allowZero?: boolean } = {}): Parsed<number> {
  const text = raw.trim();
  if (text === "") return fail("請輸入股數");
  const value = integerValue(text, false);
  if (value === null) return fail("股數只能是整數");
  if (value < (options.allowZero ? 0 : 1)) return fail("股數至少 1 股");
  if (value > MAX_SHARES) return fail("股數不能超過 10 億股");
  return ok(value);
}

// serial 是 integer 超過範圍的數字查詢時資料庫會丟錯 先當成找不到
const MAX_ROW_ID = 2_147_483_647;
const ROW_ID_PATTERN = /^[1-9]\d{0,9}$/;

export function isRowId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= MAX_ROW_ID;
}

/** 不是資料 id 就回 null 例如 0 負數 小數 前面補 0 */
export function parseRowId(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!ROW_ID_PATTERN.test(text)) return null;
  const id = Number(text);
  return isRowId(id) ? id : null;
}

// 用 code point 算字數 emoji 才不會算成兩個字
export const charCount = (text: string) => [...text].length;

// 看起來一樣的名稱要存成同一個字串 唯一索引才擋得住同名
// 零寬接合字組成 emoji 時要留著 只拿掉頭尾與貼著空白的
export function normalizeName(raw: string): string {
  return raw
    .replace(/[^\P{Cf}\u200C\u200D]/gu, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\u200C\u200D]*\s[\u200C\u200D]*/gu, " ")
    .replace(/^[\s\u200C\u200D]+|[\s\u200C\u200D]+$/gu, "");
}

export function parseName(raw: string): Parsed<string> {
  const name = normalizeName(raw);
  if (name === "") return fail("請輸入名稱");
  if (charCount(name) > NAME_MAX_LENGTH) return fail(`名稱最多 ${NAME_MAX_LENGTH} 個字`);
  return ok(name);
}

export function parseNote(raw: string): Parsed<string | null> {
  const note = raw.trim();
  if (charCount(note) > NOTE_MAX_LENGTH) return fail(`備註最多 ${NOTE_MAX_LENGTH} 個字`);
  return ok(note === "" ? null : note);
}

export const oneOf = <T extends string>(values: readonly T[], raw: string): T | null => ((values as readonly string[]).includes(raw) ? (raw as T) : null);

export function parseAccountKind(raw: string): Parsed<AccountKind> {
  const kind = oneOf(ACCOUNT_KINDS, raw);
  return kind ? ok(kind) : fail("帳戶類型不正確");
}

export function parseCategoryKind(raw: string): Parsed<CategoryKind> {
  const kind = oneOf(CATEGORY_KINDS, raw);
  return kind ? ok(kind) : fail("分類類型不正確");
}

/** today 要用台北時間 伺服器是 UTC 晚上八點後會差一天 */
export function parseEntryDate(raw: string, today: DateKey): Parsed<DateKey> {
  const date = parseDate(raw.trim());
  if (date === null) return fail("日期不正確");
  if (date > today) return fail("不能記錄未來的日期");
  return ok(date);
}

/**
 * 起始餘額是開始記帳那天的 更早的紀錄會讓過去的月份只扣錢
 * name 只會是登入者自己的帳戶 別人的 id 先當作找不到
 */
export function checkAccountStart(account: Pick<AccountLike, "name" | "startDate" | "createdAt">, date: DateKey): Parsed<DateKey> {
  const start = accountStartDate(account);
  return date >= start ? ok(date) : fail(`「${account.name}」從 ${formatMonthDay(start, date)}開始記帳，日期不能更早`);
}

/** 格式不對就當作找不到 可能是隱藏欄位被改過或畫面太舊 */
export function optionalId(raw: string, notFound: string): Parsed<number | null> {
  if (raw.trim() === "") return ok(null);
  const id = parseRowId(raw);
  return id === null ? fail(notFound) : ok(id);
}

export function requiredId(raw: string, missing: string, notFound: string): Parsed<number> {
  if (raw.trim() === "") return fail(missing);
  const id = parseRowId(raw);
  return id === null ? fail(notFound) : ok(id);
}

/** 表單有好幾個金額欄位時 錯誤要寫出是哪一欄 */
export function labelled<T>(label: string, parsed: Parsed<T>): Parsed<T> {
  return parsed.ok ? parsed : fail(`${label}：${parsed.error}`);
}

export const optional = (raw: string, parse: (raw: string) => Parsed<number>): Parsed<number | null> => (raw.trim() === "" ? ok(null) : parse(raw));

const DAY_PATTERN = /^\d{1,2}$/;

export function parseDay(raw: string, error: string): Parsed<number> {
  const text = raw.trim();
  const day = Number(text);
  return DAY_PATTERN.test(text) && day >= 1 && day <= 31 ? ok(day) : fail(error);
}

export type Fields<K extends string> = Record<K, string>;

/** 勾選框送出時是 on 沒勾就沒有這個欄位 */
export const checked = (raw: string) => raw === "on" || raw === "true";

/** 期別是 YYYY-MM 資料庫格式的 1 號也收 */
export function parsePeriod(raw: string): MonthKey | null {
  const text = raw.trim();
  return parseMonth(/^\d{4}-\d{2}-01$/.test(text) ? text.slice(0, 7) : text);
}
