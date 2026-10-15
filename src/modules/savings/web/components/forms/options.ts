import type { AccountKind, CategoryKind, EntryKind, PaletteColor } from "../../../lib/kinds";

// 頁面整理好這些形狀交給表單 表單不自己讀資料 整理的函式在 web/dashboard-view.ts

/**
 * 啟用中的帳戶 照設定的順序 選填的兩個欄位沒給時表單照樣能用
 * payFromAccountId 是繳卡費的轉出 startDate 是日期欄位的下限
 */
export type AccountOption = { id: number; name: string; kind: AccountKind; payFromAccountId?: number | null; startDate?: string };

export type CategoryOption = { id: number; name: string; kind: CategoryKind; color: PaletteColor };

/** 含停用的帳戶 篩選與修改舊紀錄時要選得到原本的帳戶 */
export type AccountChoice = AccountOption & { active: boolean };

/** 建議金額由 lib/ledger 的 suggestAllocation 用這些欄位算 */
export type SalaryAccountOption = AccountOption & {
  balance: number;
  monthlyPlan: number | null;
  targetAmount: number | null;
  sortOrder: number;
};

/** today 是台北時間的 YYYY-MM-DD 當日期欄位的預設值與上限 */
export type EntryFormOptions = { accounts: AccountOption[]; categories: CategoryOption[]; today: string };

type EntryValues = { id: number; kind: EntryKind; accountId: number; counterAccountId: number | null; categoryId: number | null; amount: number; note: string | null };

/** 修改紀錄時帶入 調整不能修改所以沒有 adjust */
export type EntryDraft = EntryValues & { date: string };

/**
 * 修改固定收支時帶入的原本內容
 * active lastPostedMonth 與 ISO 字串的 createdAt 用來算下次日期
 */
export type RecurringDraft = EntryValues & { dayOfMonth: number; active: boolean; lastPostedMonth: string | null; createdAt: string };
