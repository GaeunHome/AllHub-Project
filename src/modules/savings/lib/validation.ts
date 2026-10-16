import { formatMonthDay, parseDate, type DateKey } from "./dates";
import {
  ACCOUNT_KINDS,
  CATEGORY_KINDS,
  ENTRY_KINDS,
  HOLIDAY_RULES,
  INTERVAL_MONTHS,
  MAX_SHARES,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  RECURRING_MODES,
  SELECTABLE_COLORS,
  type AccountKind,
  type CategoryKind,
  type EntryKind,
  type HolidayRule,
  type IntervalMonths,
  type PaletteColor,
  type RecurringMode,
} from "./kinds";
import { accountStartDate, balanceFromFigure, type AccountLike } from "./ledger";
import { MAX_AMOUNT } from "./money";
import { monthToDate, parseMonth, type MonthKey } from "./month";
import { normalizeSymbol } from "./quotes";

// 把表單的字串解析成資料表的值 id 是不是自己的由 service 查資料庫確認

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** 別人的 刪掉的或格式不對的 id 都用同一句 不透露那筆資料存不存在 */
export const NOT_FOUND = {
  account: "找不到這個帳戶，可能已經刪除了",
  purpose: "找不到這個用途，可能已經刪除了",
  category: "找不到這個分類，可能已經刪除了",
  transaction: "找不到這筆紀錄，可能已經刪除了",
  recurring: "找不到這個固定收支，可能已經刪除了",
  holding: "找不到這一檔持股，可能已經刪除了",
} as const;

/** 定期定額要股數 薪水要實際金額 自動記帳記不出來 */
export const REGULAR_BUY_NEEDS_CONFIRM = "定期定額要確認股數，只能選『到期請我確認』";
export const SALARY_NEEDS_CONFIRM = "薪水要確認實際金額，只能選『到期請我確認』";
export const SYMBOL_NOT_FOUND = "找不到這個代號：只支援台股上市櫃股票與 ETF";
// 期別是隱藏欄位 格式不對就是表單被改過或畫面太舊
const PERIOD_INVALID = "這一期的資料不正確，請重新整理頁面再試一次";

const SAME_ACCOUNT = "轉出和轉入不能是同一個帳戶";

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

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
const charCount = (text: string) => [...text].length;

// 看起來一樣的名稱要存成同一個字串 唯一索引才擋得住同名
// 零寬接合字組成 emoji 時要留著 只拿掉頭尾與貼著空白的
function normalizeName(raw: string): string {
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

const oneOf = <T extends string>(values: readonly T[], raw: string): T | null => ((values as readonly string[]).includes(raw) ? (raw as T) : null);

/** 灰色留給未分類與未設定用途 表單送來也不收 */
export function parseColor(raw: string): Parsed<PaletteColor> {
  const color = oneOf(SELECTABLE_COLORS, raw);
  return color ? ok(color) : fail("顏色不正確");
}

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
export function checkAccountStart(account: Pick<AccountLike, "name" | "createdAt">, date: DateKey): Parsed<DateKey> {
  const start = accountStartDate(account);
  return date >= start ? ok(date) : fail(`「${account.name}」從 ${formatMonthDay(start, date)}開始記帳，日期不能更早`);
}

/** 格式不對就當作找不到 可能是隱藏欄位被改過或畫面太舊 */
function optionalId(raw: string, notFound: string): Parsed<number | null> {
  if (raw.trim() === "") return ok(null);
  const id = parseRowId(raw);
  return id === null ? fail(notFound) : ok(id);
}

function requiredId(raw: string, missing: string, notFound: string): Parsed<number> {
  if (raw.trim() === "") return fail(missing);
  const id = parseRowId(raw);
  return id === null ? fail(notFound) : ok(id);
}

/** 表單有好幾個金額欄位時 錯誤要寫出是哪一欄 */
function labelled<T>(label: string, parsed: Parsed<T>): Parsed<T> {
  return parsed.ok ? parsed : fail(`${label}：${parsed.error}`);
}

const optional = (raw: string, parse: (raw: string) => Parsed<number>): Parsed<number | null> => (raw.trim() === "" ? ok(null) : parse(raw));

const DAY_PATTERN = /^\d{1,2}$/;

function parseDay(raw: string, error: string): Parsed<number> {
  const text = raw.trim();
  const day = Number(text);
  return DAY_PATTERN.test(text) && day >= 1 && day <= 31 ? ok(day) : fail(error);
}

type Fields<K extends string> = Record<K, string>;

export type AccountInput = {
  name: string;
  purposeId: number | null;
  openingBalance: number;
  openingCost: number | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  dueDay: number | null;
  payFromAccountId: number | null;
  statementDay: number | null;
  autopay: boolean;
};

/** 勾選框送出時是 on 沒勾就沒有這個欄位 */
const checked = (raw: string) => raw === "on" || raw === "true";

// 跟表單的欄位名稱一樣 新增時填現在的數字 修改時改開始記帳時的數字
const OPENING_LABELS: Record<"create" | "update", Record<AccountKind, string>> = {
  create: { deposit: "起始餘額", investment: "目前市值", credit: "目前未繳" },
  update: { deposit: "起始餘額", investment: "起始市值", credit: "起始未繳" },
};

/**
 * 不適用這個類型的欄位當成 null 例如切換類型前填的
 * 信用卡填的是未繳 存成負的起始餘額 負的未繳是溢繳
 */
export function parseAccountFields(
  fields: Fields<"name" | "purposeId" | "openingBalance" | "openingCost" | "monthlyPlan" | "targetAmount" | "dueDay" | "payFromAccountId" | "statementDay" | "autopay">,
  kind: AccountKind,
  mode: "create" | "update" = "create",
): Parsed<AccountInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const purposeId = optionalId(fields.purposeId, NOT_FOUND.purpose);
  if (!purposeId.ok) return purposeId;
  const opening = labelled(OPENING_LABELS[mode][kind], fields.openingBalance.trim() === "" ? ok(0) : parseBalance(fields.openingBalance, { allowNegative: kind === "credit" }));
  if (!opening.ok) return opening;
  const openingCost = kind === "investment" ? labelled("成本", optional(fields.openingCost, parseBalance)) : ok(null);
  if (!openingCost.ok) return openingCost;
  const monthlyPlan = kind === "credit" ? ok(null) : labelled("每月規劃", optional(fields.monthlyPlan, parseAmount));
  if (!monthlyPlan.ok) return monthlyPlan;
  const targetAmount = kind === "credit" ? ok(null) : labelled("目標金額", optional(fields.targetAmount, parseAmount));
  if (!targetAmount.ok) return targetAmount;
  const dueDay = kind === "credit" && fields.dueDay.trim() !== "" ? parseDay(fields.dueDay, "繳款截止日要在 1 到 31 日之間") : ok(null);
  if (!dueDay.ok) return dueDay;
  const statementDay = kind === "credit" && fields.statementDay.trim() !== "" ? parseDay(fields.statementDay, "結帳日要在 1 到 31 日之間") : ok(null);
  if (!statementDay.ok) return statementDay;
  const payFromAccountId = kind === "credit" ? optionalId(fields.payFromAccountId, NOT_FOUND.account) : ok(null);
  if (!payFromAccountId.ok) return payFromAccountId;
  return ok({
    name: name.value,
    purposeId: purposeId.value,
    openingBalance: balanceFromFigure(kind, opening.value),
    openingCost: openingCost.value,
    monthlyPlan: monthlyPlan.value,
    targetAmount: targetAmount.value,
    dueDay: dueDay.value,
    payFromAccountId: payFromAccountId.value,
    statementDay: statementDay.value,
    autopay: kind === "credit" && checked(fields.autopay),
  });
}

export type PurposeInput = { name: string; color: PaletteColor };

export function parsePurposeFields(fields: Fields<"name" | "color">): Parsed<PurposeInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const color = parseColor(fields.color);
  if (!color.ok) return color;
  return ok({ name: name.value, color: color.value });
}

export type CategoryInput = { name: string; color: PaletteColor; monthlyBudget: number | null };

/** 只有支出能設預算 收入的忽略 */
export function parseCategoryFields(fields: Fields<"name" | "color" | "monthlyBudget">, kind: CategoryKind): Parsed<CategoryInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const color = parseColor(fields.color);
  if (!color.ok) return color;
  const monthlyBudget = kind === "expense" ? optional(fields.monthlyBudget, parseAmount) : ok(null);
  if (!monthlyBudget.ok) return monthlyBudget;
  return ok({ name: name.value, color: color.value, monthlyBudget: monthlyBudget.value });
}

type EntryCore = { kind: EntryKind; accountId: number; counterAccountId: number | null; categoryId: number | null; amount: number; note: string | null };

/**
 * 紀錄與固定收支共用 轉帳要有另一個轉入帳戶 不能有分類
 * 收支忽略轉入帳戶 分類可以留空當未分類
 */
function parseEntryCore(fields: Fields<"kind" | "accountId" | "counterAccountId" | "categoryId" | "amount" | "note">, { counterFromHolding = false } = {}): Parsed<EntryCore> {
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

/**
 * startMonth 存那個月的 1 號 每月一次時不用 是 null
 * 定期定額的 counterAccountId 先是 null 由 service 照那一檔所在的投資帳戶填
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
  | "allocate";

function parseInterval(raw: string): Parsed<IntervalMonths> {
  const text = raw.trim();
  if (text === "") return ok(1);
  const interval = INTERVAL_MONTHS.find((value) => String(value) === text);
  return interval === undefined ? fail("多久一次不正確") : ok(interval);
}

/** 期別是 YYYY-MM 資料庫格式的 1 號也收 */
export function parsePeriod(raw: string): MonthKey | null {
  const text = raw.trim();
  return parseMonth(/^\d{4}-\d{2}-01$/.test(text) ? text.slice(0, 7) : text);
}

/**
 * kind 是 regular 或帶了 holdingId 的 transfer 是定期定額 一定要選哪一檔
 * 空白的間隔 假日規則與記帳方式是每月 照原日 到期請我確認
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
  });
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

/** 只從自己的帳戶找名稱 錯誤訊息才不會洩漏別人的帳戶名稱 */
function salaryLineLabel(rawAccountId: string, accountNames: ReadonlyMap<number, string> | undefined): string {
  const id = parseRowId(rawAccountId);
  const name = id === null ? undefined : accountNames?.get(id);
  return name === undefined ? "分配金額" : `分配給「${name}」的金額`;
}

/** recurring 是從待處理確認薪水那一期時帶的 臨時的獎金是 null */
export type SalaryInput = {
  accountId: number;
  categoryId: number | null;
  amount: number;
  date: DateKey;
  note: string | null;
  transfers: { accountId: number; amount: number }[];
  recurring: { ruleId: number; period: MonthKey } | null;
};

// 一個帳戶只有一行 重複或行數比帳戶多就是表單被改過或畫面太舊
const SALARY_LINES_INVALID = "分配的帳戶不正確，請重新整理頁面再試一次";

/**
 * 金額 0 或留空就略過 分出去的不能超過薪水 剩下的留在入帳帳戶
 * accountNames 是自己全部的帳戶 用來限制行數與在錯誤裡寫出帳戶名稱
 */
export function parseSalaryFields(
  fields: Fields<"accountId" | "categoryId" | "amount" | "date" | "note"> & { transfers: Fields<"accountId" | "amount">[]; ruleId?: string; period?: string },
  today: DateKey,
  accountNames?: ReadonlyMap<number, string>,
): Parsed<SalaryInput> {
  const ruleId = optionalId(fields.ruleId ?? "", NOT_FOUND.recurring);
  if (!ruleId.ok) return ruleId;
  const period = ruleId.value === null ? null : parsePeriod(fields.period ?? "");
  if (ruleId.value !== null && period === null) return fail(PERIOD_INVALID);
  const accountId = requiredId(fields.accountId, "請選擇入帳的帳戶", NOT_FOUND.account);
  if (!accountId.ok) return accountId;
  const categoryId = optionalId(fields.categoryId, NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  const note = parseNote(fields.note);
  if (!note.ok) return note;

  if (accountNames !== undefined && fields.transfers.length > accountNames.size) return fail(SALARY_LINES_INVALID);
  const transfers: SalaryInput["transfers"] = [];
  for (const line of fields.transfers) {
    const lineAmount = line.amount.trim() === "" ? ok(0) : parseBalance(line.amount);
    if (!lineAmount.ok) return labelled(salaryLineLabel(line.accountId, accountNames), lineAmount);
    if (lineAmount.value === 0) continue;
    const lineAccount = requiredId(line.accountId, "請選擇要轉入的帳戶", NOT_FOUND.account);
    if (!lineAccount.ok) return lineAccount;
    if (lineAccount.value === accountId.value) return fail(SAME_ACCOUNT);
    if (transfers.some((transfer) => transfer.accountId === lineAccount.value)) return fail(SALARY_LINES_INVALID);
    transfers.push({ accountId: lineAccount.value, amount: lineAmount.value });
  }
  if (transfers.reduce((total, line) => total + line.amount, 0) > amount.value) return fail("分出去的金額超過薪水了");

  return ok({
    accountId: accountId.value,
    categoryId: categoryId.value,
    amount: amount.value,
    date: date.value,
    note: note.value,
    transfers,
    recurring: ruleId.value === null || period === null ? null : { ruleId: ruleId.value, period },
  });
}

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

/** billAmount 是一起填這一期的帳單 沒填是 null categoryId 是補記的刷卡的分類 */
export type PayCardInput = { cardId: number; fromAccountId: number; amount: number; date: DateKey; billAmount: number | null; categoryId: number | null };

// 帳單照銀行的 繳清或沒有消費時是 0
const parseBillAmount = (raw: string) => labelled("帳單金額", parseBalance(raw));

export function parsePayCardFields(fields: Fields<"cardId" | "fromAccountId" | "amount" | "date"> & { billAmount?: string; categoryId?: string }, today: DateKey): Parsed<PayCardInput> {
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
  const categoryId = optionalId(fields.categoryId ?? "", NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  return ok({ cardId, fromAccountId: fromAccountId.value, amount: amount.value, date: date.value, billAmount: billAmount.value, categoryId: categoryId.value });
}

/** statementDate 沒填是這一期 categoryId 是補記的刷卡記在哪個支出分類 */
export type CardBillInput = { cardId: number; amount: number; statementDate: DateKey | null; categoryId: number | null };

export function parseCardBillFields(fields: Fields<"cardId" | "amount" | "statementDate" | "categoryId">, today: DateKey): Parsed<CardBillInput> {
  const cardId = parseRowId(fields.cardId);
  if (cardId === null) return fail(NOT_FOUND.account);
  const amount = parseBillAmount(fields.amount);
  if (!amount.ok) return amount;
  const statementDate = fields.statementDate.trim() === "" ? ok(null) : labelled("結帳日", parseEntryDate(fields.statementDate, today));
  if (!statementDate.ok) return statementDate;
  const categoryId = optionalId(fields.categoryId, NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  return ok({ cardId, amount: amount.value, statementDate: statementDate.value, categoryId: categoryId.value });
}
