import type { AccountKind, CategoryKind, EntryKind, HolidayRule, RecurringMode } from "../../../lib/kinds";

// 頁面整理好這些形狀交給表單 表單不自己讀資料 整理的函式在 web/dashboard-view.ts

/**
 * 啟用中的帳戶照設定的順序 payFromAccountId 是繳卡費的轉出 startDate 是日期欄位的下限
 * withHoldings 是有持股的投資帳戶 轉帳的選單不列 要用買進賣出
 */
export type AccountOption = { id: number; name: string; kind: AccountKind; payFromAccountId?: number | null; startDate?: string; withHoldings?: boolean };

export type CategoryOption = { id: number; name: string; kind: CategoryKind };

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

/** 定期定額選哪一檔 accountId 是它所在的投資帳戶 active 是那個帳戶還在用 */
export type HoldingOption = { id: number; symbol: string; name: string; accountId: number; accountName: string; active: boolean };

/**
 * 修改固定收支時帶入的原本內容
 * active lastPostedMonth 與 ISO 字串的 createdAt 用來算下一期
 */
export type RecurringDraft = EntryValues & {
  name: string | null;
  dayOfMonth: number;
  intervalMonths: number;
  /** 第一期的月份 1 號 null 是舊資料 當成建立的那個月 */
  startMonth: string | null;
  holidayRule: HolidayRule;
  mode: RecurringMode;
  holdingId: number | null;
  allocate: boolean;
  active: boolean;
  lastPostedMonth: string | null;
  createdAt: string;
};
