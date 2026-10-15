/** 輸入或操作有誤 訊息可以直接給使用者看 */
export class SavingsUserError extends Error {}

/** 資料庫的唯一索引擋下同名時用 */
export const DUPLICATE_NAME = {
  account: "已經有同名的帳戶",
  purpose: "已經有同名的用途",
  category: "已經有同名的分類",
} as const;

export const INACTIVE_ACCOUNT = "這個帳戶已停用，請先恢復";
export const CATEGORY_KIND_MISMATCH = "分類跟收支類型不符";
export const ADJUST_NOT_EDITABLE = "更新餘額的調整不能修改，可以刪除後再更新一次餘額";
export const PAY_FROM_NOT_DEPOSIT = "扣款帳戶要選存款帳戶";
export const SALARY_INTO_CREDIT = "薪水要入帳到存款或投資帳戶";
export const SALARY_TO_CREDIT = "發薪分配不能轉到信用卡";
export const ADJUST_TOO_LARGE = "跟目前的餘額差超過 1 億元，請確認輸入的金額";
