import { HOLIDAY_RULES, INTERVAL_MONTHS, RECURRING_MODES, type EntryKind, type HolidayRule, type IntervalMonths, type RecurringMode } from "../../../lib/kinds";
import { addMonths, dateToMonth, type MonthKey } from "../../../lib/month";

// 固定收支表單的欄位連動 不依賴 React 才能直接測

/** 定期定額是買進持股的轉帳 表單上跟轉帳分開 */
export const RECURRING_TYPES = ["expense", "income", "transfer", "regular"] as const;
export type RecurringType = (typeof RECURRING_TYPES)[number];
export const RECURRING_TYPE_LABELS: Record<RecurringType, string> = { expense: "支出", income: "收入", transfer: "轉帳", regular: "定期定額" };

export function recurringTypeOf(rule: { kind: EntryKind; holdingId: number | null }): RecurringType {
  return rule.holdingId !== null ? "regular" : rule.kind;
}

/** 送出的 kind 定期定額是轉帳 */
export function entryKindOf(type: RecurringType): EntryKind {
  return type === "regular" ? "transfer" : type;
}

/**
 * suggest 是新增的規則 換成定期定額或勾薪水時順便帶入建議的假日規則
 * 修改舊規則時不動使用者原本的設定
 */
export type RecurringFormState = {
  type: RecurringType;
  intervalMonths: IntervalMonths;
  startMonth: MonthKey;
  day: number;
  holidayRule: HolidayRule;
  mode: RecurringMode;
  allocate: boolean;
  suggest: boolean;
};

export type RecurringFormEvent =
  | { type: "type"; value: RecurringType }
  | { type: "interval"; value: IntervalMonths }
  | { type: "startMonth"; value: MonthKey }
  | { type: "day"; value: number }
  | { type: "holidayRule"; value: HolidayRule }
  | { type: "mode"; value: RecurringMode }
  | { type: "allocate"; value: boolean };

/** 照原日時才換成建議的 使用者自己選過提前或延後就不動 */
const suggested = (state: RecurringFormState, rule: HolidayRule): HolidayRule => (state.suggest && state.holidayRule === "none" ? rule : state.holidayRule);

export function recurringFormReducer(state: RecurringFormState, event: RecurringFormEvent): RecurringFormState {
  switch (event.type) {
    case "type": {
      // 扣款日遇假日順延到下一個交易日
      const holidayRule = event.value === "regular" && state.type !== "regular" ? suggested(state, "after") : state.holidayRule;
      return { ...state, type: event.value, holidayRule, allocate: event.value === "income" && state.allocate };
    }
    case "interval":
      return { ...state, intervalMonths: event.value };
    case "startMonth":
      return { ...state, startMonth: event.value };
    case "day":
      return { ...state, day: event.value };
    case "holidayRule":
      return { ...state, holidayRule: event.value };
    case "mode":
      return { ...state, mode: event.value };
    case "allocate":
      // 發薪日遇假日只能提前 不能延後
      return { ...state, allocate: event.value, holidayRule: event.value ? suggested(state, "before") : state.holidayRule };
  }
}

/** 定期定額要確認股數 薪水要確認實際金額 都不能自動記 */
export function modeLockedBy(state: Pick<RecurringFormState, "type" | "allocate">): "regular" | "salary" | null {
  if (state.type === "regular") return "regular";
  return state.type === "income" && state.allocate ? "salary" : null;
}

export function effectiveMode(state: RecurringFormState): RecurringMode {
  return modeLockedBy(state) ? "confirm" : state.mode;
}

// 選單的值是字串 認不得的退回預設 跟伺服器一樣
export const parseInterval = (value: number): IntervalMonths => INTERVAL_MONTHS.find((months) => months === value) ?? 1;
export const parseHolidayRule = (value: string): HolidayRule => HOLIDAY_RULES.find((rule) => rule === value) ?? "none";
export const parseMode = (value: string): RecurringMode => RECURRING_MODES.find((mode) => mode === value) ?? "confirm";

/**
 * 從哪個月開始的選項 從這個月起一年 間隔最長一年 這樣就選得到每一種排法
 * 修改時原本的月份在範圍外也列出來 儲存時才不會默默換掉
 */
export function startMonthOptions(today: string, keep?: MonthKey | null): MonthKey[] {
  const current = dateToMonth(today);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, i));
  return keep && !months.includes(keep) ? [keep, ...months].sort() : months;
}
