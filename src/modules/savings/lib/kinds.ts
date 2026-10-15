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

/** 色值在 globals.css 的 --fin-blue 這類變數 淺色深色各一組 */
export const PALETTE = ["blue", "teal", "green", "amber", "orange", "rose", "violet", "slate"] as const;
export type PaletteColor = (typeof PALETTE)[number];
/** 灰色留給未分類與未設定用途 圖上才分得出來 */
export const SELECTABLE_COLORS = PALETTE.filter((color) => color !== "slate");
export const PALETTE_LABELS: Record<PaletteColor, string> = {
  blue: "藍",
  teal: "青",
  green: "綠",
  amber: "黃",
  orange: "橘",
  rose: "紅",
  violet: "紫",
  slate: "灰",
};

export const NAME_MAX_LENGTH = 20;
export const NOTE_MAX_LENGTH = 200;
