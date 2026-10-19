import { taipeiMonthKey } from "@/core/time";
import { addDays, lastDayOfMonth, taipeiToday, type DateKey } from "./dates";
import { shiftForHoliday } from "./holidays";
import { INTERVAL_LABELS, RECURRING_MODE_LABELS, type EntryKind, type HolidayRule, type IntervalMonths, type RecurringMode, type TransactionKind } from "./kinds";
import { addMonths, dateToMonth, monthIndex, type MonthKey } from "./month";

// 期別用月份表示 第一期之後每 intervalMonths 個月一期
// lastPostedMonth 是游標 自動記 確認或略過都會把它推到那一期

/** 月份欄位存的是 1 號 表單即時試算時送 YYYY-MM 兩種都收 */
export type RecurringLike = {
  dayOfMonth: number;
  intervalMonths: number;
  startMonth: string | null;
  holidayRule: HolidayRule;
  lastPostedMonth: string | null;
  createdAt: Date;
};

/** 提前時日期可能在上個月 期別還是原本的月份 */
export type Occurrence = { period: MonthKey; date: DateKey };

/** 待處理提早幾天出現 確認與略過也只收這段時間內的期別 */
export const PENDING_LOOKAHEAD_DAYS = 7;

/** 沒有那一天的月份就是月底 例如 2 月 30 日 */
export function scheduledDate(month: MonthKey, dayOfMonth: number): DateKey {
  return `${month}-${String(Math.min(dayOfMonth, lastDayOfMonth(month))).padStart(2, "0")}`;
}

/** 先照日期 沒有那天就月底 再照假日規則調整 */
export function occurrenceDate(rule: Pick<RecurringLike, "dayOfMonth" | "holidayRule">, month: MonthKey): DateKey {
  return shiftForHoliday(scheduledDate(month, rule.dayOfMonth), rule.holidayRule);
}

/** 舊資料沒有起始月份 從建立的月份算 */
export function firstPeriod(rule: Pick<RecurringLike, "startMonth" | "createdAt">): MonthKey {
  return rule.startMonth === null ? taipeiMonthKey(rule.createdAt) : dateToMonth(rule.startMonth);
}

// 資料庫的 check 只收 1 2 3 6 12 這裡多擋一次 迴圈才不會停不下來
const intervalOf = (rule: Pick<RecurringLike, "intervalMonths">) => Math.max(1, Math.trunc(rule.intervalMonths));

/** 改過間隔或起始月時游標不一定剛好在期別上 所以找嚴格晚於它的第一期 */
function periodAfter(rule: Pick<RecurringLike, "intervalMonths" | "startMonth" | "createdAt">, after: MonthKey | null): MonthKey {
  const first = firstPeriod(rule);
  if (after === null || after < first) return first;
  const interval = intervalOf(rule);
  return addMonths(first, (Math.floor((monthIndex(after) - monthIndex(first)) / interval) + 1) * interval);
}

const firstOpenPeriod = (rule: RecurringLike) => periodAfter(rule, rule.lastPostedMonth === null ? null : dateToMonth(rule.lastPostedMonth));

/** 游標之後到 until 為止的每一期 建立之前的日期不算 */
function openOccurrences(rule: RecurringLike, until: DateKey): Occurrence[] {
  const created = taipeiToday(rule.createdAt);
  // 提前最多跨回上個月 所以多看一個月
  const lastPeriod = addMonths(dateToMonth(until), 1);
  const occurrences: Occurrence[] = [];
  for (let period = firstOpenPeriod(rule); period <= lastPeriod; period = periodAfter(rule, period)) {
    const date = occurrenceDate(rule, period);
    if (date <= until && date >= created) occurrences.push({ period, date });
  }
  return occurrences;
}

/** 日期在 from 到 until 之間的每一期 處理過的也算 建立之前的日期不算 */
export function occurrencesBetween(rule: Omit<RecurringLike, "lastPostedMonth">, from: DateKey, until: DateKey): Occurrence[] {
  const created = taipeiToday(rule.createdAt);
  // 遇假日延後可能從上個月跨過來 提前可能從下個月跨回來 所以前後各多看一個月
  const lastPeriod = addMonths(dateToMonth(until), 1);
  const occurrences: Occurrence[] = [];
  for (let period = periodAfter(rule, addMonths(dateToMonth(from), -2)); period <= lastPeriod; period = periodAfter(rule, period)) {
    const date = occurrenceDate(rule, period);
    if (date >= from && date <= until && date >= created) occurrences.push({ period, date });
  }
  return occurrences;
}

/** 自動記帳最多補最近 limit 期 排程停了很久時才不會一次記一大堆 */
export function dueMonths(rule: RecurringLike, today: DateKey, limit = 12): MonthKey[] {
  return openOccurrences(rule, today)
    .slice(-limit)
    .map((occurrence) => occurrence.period);
}

/** 要照順序確認 所以沒處理的期別全部列出 不能只取最近幾期 */
export function pendingOccurrences(rule: RecurringLike, today: DateKey, lookaheadDays = PENDING_LOOKAHEAD_DAYS): Occurrence[] {
  return openOccurrences(rule, addDays(today, lookaheadDays));
}

/** 還有沒處理的過去期別時是最舊那一期 跟待處理列的同一期 */
export function nextRunDate(rule: RecurringLike, today: DateKey): DateKey {
  const [due] = openOccurrences(rule, today);
  if (due !== undefined) return due.date;
  const created = taipeiToday(rule.createdAt);
  for (let period = firstOpenPeriod(rule); ; period = periodAfter(rule, period)) {
    const date = occurrenceDate(rule, period);
    if (date >= created && date > today) return date;
  }
}

type PeriodRecord = { kind: TransactionKind; recurringPeriod: string | null };

/** 這一期記下的那一筆 薪水分出去的轉帳也標了同一期 只認跟規則同一種的 */
export function isPeriodRecord<T extends PeriodRecord>(record: T, rule: { kind: EntryKind }): record is T & { recurringPeriod: string } {
  return record.recurringPeriod !== null && record.kind === rule.kind;
}

/** 刪掉這一筆時游標退回前一期 只有要確認的規則而且游標剛好在這一期 自動記的不退 不然排程隔天又記一次 */
export function revertsPeriod(record: PeriodRecord, rule: { kind: EntryKind; mode: RecurringMode; lastPostedMonth: string | null }): boolean {
  return isPeriodRecord(record, rule) && rule.mode === "confirm" && rule.lastPostedMonth === record.recurringPeriod;
}

/** 刪除確認來的紀錄時游標退回這裡 第一期之前是 null */
export function previousOccurrenceMonth(rule: Pick<RecurringLike, "intervalMonths" | "startMonth" | "createdAt">, month: MonthKey): MonthKey | null {
  const first = firstPeriod(rule);
  if (month <= first) return null;
  const interval = intervalOf(rule);
  return addMonths(first, (Math.ceil((monthIndex(month) - monthIndex(first)) / interval) - 1) * interval);
}

const intervalLabel = (interval: number) => INTERVAL_LABELS[interval as IntervalMonths] ?? `每 ${interval} 個月`;

/** 多久一次的哪一天 每年的要寫出月份 不然看不出是哪個月 */
export function scheduleDay(rule: Pick<RecurringLike, "dayOfMonth" | "intervalMonths" | "startMonth" | "createdAt">): string {
  return rule.intervalMonths === 12 ? `每年 ${Number(firstPeriod(rule).slice(5, 7))} 月 ${rule.dayOfMonth} 日` : `${intervalLabel(rule.intervalMonths)} ${rule.dayOfMonth} 日`;
}

/** 設定頁每一列的排程 日期 假日規則與記帳方式各一段 */
export function scheduleText(rule: Pick<RecurringLike, "dayOfMonth" | "intervalMonths" | "startMonth" | "holidayRule" | "createdAt"> & { mode: RecurringMode }): string {
  const holiday = rule.holidayRule === "before" ? ["遇假日提前"] : rule.holidayRule === "after" ? ["遇假日延後"] : [];
  return [scheduleDay(rule), ...holiday, RECURRING_MODE_LABELS[rule.mode]].join(" · ");
}

/** 名稱都從登入者自己的資料找 不會寫出別人的帳戶 */
export type RecurringNames = { accounts: ReadonlyMap<number, string>; categories: ReadonlyMap<number, string>; holdingSymbols: ReadonlyMap<number, string> };

type Named = { id: number; name: string };

/** 從登入者自己的帳戶 分類與持股建名稱表 */
export function recurringNames({ accounts, categories, holdings }: { accounts: readonly Named[]; categories: readonly Named[]; holdings: readonly { id: number; symbol: string }[] }): RecurringNames {
  return {
    accounts: new Map(accounts.map((account) => [account.id, account.name])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(holdings.map((holding) => [holding.id, holding.symbol])),
  };
}

type TitledRule = { name: string | null; kind: EntryKind; accountId: number; counterAccountId: number | null; categoryId: number | null; holdingId: number | null; note: string | null };

/** 固定收支的名稱只有這一套 沒取名的舊資料照紀錄的標題規則 */
export function recurringTitle(rule: TitledRule, names: RecurringNames): string {
  if (rule.name) return rule.name;
  const symbol = rule.holdingId === null ? undefined : names.holdingSymbols.get(rule.holdingId);
  if (symbol !== undefined) return `${symbol} 定期定額`;
  const account = (id: number | null) => (id === null ? undefined : names.accounts.get(id)) ?? "已刪除的帳戶";
  if (rule.kind === "transfer") return `${account(rule.accountId)} → ${account(rule.counterAccountId)}`;
  return (rule.categoryId === null ? undefined : names.categories.get(rule.categoryId)) ?? rule.note ?? "未分類";
}
