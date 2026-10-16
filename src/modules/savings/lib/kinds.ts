// 這些值同時寫進資料庫的 check 與表單 中文名稱集中在這裡讓畫面與訊息一致

export const ACCOUNT_KINDS = ["deposit", "investment", "credit"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = { deposit: "存款", investment: "投資", credit: "信用卡" };

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = { expense: "支出", income: "收入" };

/** 調整只由更新餘額產生 表單不能直接選 */
export const TRANSACTION_KINDS = ["expense", "income", "transfer", "adjust"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = { expense: "支出", income: "收入", transfer: "轉帳", adjust: "調整" };

export const ENTRY_KINDS = ["expense", "income", "transfer"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** 分類與用途存的顏色 畫面不再顯示 留著是因為資料庫的 check 與舊資料 */
export const PALETTE = ["blue", "teal", "green", "amber", "orange", "rose", "violet", "slate"] as const;
export type PaletteColor = (typeof PALETTE)[number];
/** 灰色留給未分類與未設定用途 新的分類與用途不用它 */
export const SELECTABLE_COLORS = PALETTE.filter((color) => color !== "slate");

export const NAME_MAX_LENGTH = 20;
export const NOTE_MAX_LENGTH = 200;

/** 固定收支的日期遇到假日時怎麼辦 */
export const HOLIDAY_RULES = ["none", "before", "after"] as const;
export type HolidayRule = (typeof HOLIDAY_RULES)[number];
export const HOLIDAY_RULE_LABELS: Record<HolidayRule, string> = { none: "照原日", before: "提前到前一個工作日", after: "延後到下一個工作日" };

/** 舊的固定收支都是自動記 新增時預設要確認 */
export const RECURRING_MODES = ["confirm", "auto"] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];
export const RECURRING_MODE_LABELS: Record<RecurringMode, string> = { confirm: "到期請我確認", auto: "自動記帳" };

export const INTERVAL_MONTHS = [1, 2, 3, 6, 12] as const;
export type IntervalMonths = (typeof INTERVAL_MONTHS)[number];
export const INTERVAL_LABELS: Record<IntervalMonths, string> = { 1: "每月", 2: "每 2 個月", 3: "每 3 個月", 6: "每半年", 12: "每年" };

/** 台股代號 上市櫃股票與 ETF 例如 2330 006208 00679B */
export const SYMBOL_PATTERN = /^[0-9A-Z]{4,6}$/;
// 擋掉多打幾個 0 的手誤 台股最小單位是 1 股
export const MAX_SHARES = 1_000_000_000;
