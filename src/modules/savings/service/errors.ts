import { formatNumber } from "../lib/money";
import { PENDING_LOOKAHEAD_DAYS } from "../lib/recurring";

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
export const TRADE_NOT_EDITABLE = "買賣紀錄只能改日期和備註，要改金額或股數請刪除後重記";
export const PAY_FROM_NOT_DEPOSIT = "扣款帳戶要選存款帳戶";
export const SALARY_INTO_CREDIT = "薪水要入帳到存款或投資帳戶";
export const SALARY_TO_CREDIT = "發薪分配不能轉到信用卡";
export const ADJUST_TOO_LARGE = "跟目前的餘額差超過 1 億元，請確認輸入的金額";
export const BALANCE_NOT_FOR_CREDIT = "信用卡不用更新餘額：刷卡請記一筆，繳款請用繳卡費";
export const BALANCE_HELD_INVESTMENT = "這個投資帳戶有持股：市值照股價算，要對帳請修改持股";

export const HOLDING_NOT_INVESTMENT = "持股要放在投資帳戶";
export const HELD_INVESTMENT_TRANSFER = "這個投資帳戶有持股：轉進轉出請用買進或賣出";
export const TRADE_ACCOUNT_NOT_DEPOSIT = "買進賣出的錢要從存款帳戶轉，請選存款帳戶";
export const QUOTES_UNAVAILABLE = "暫時讀不到股價清單，請稍後再試";
export const NOT_ENOUGH_SHARES = (shares: number) => `目前只有 ${formatNumber(shares)} 股，不能賣更多`;
export const DUPLICATE_HOLDING = (symbol: string) => `這個帳戶已經有 ${symbol} 了，要改股數請修改那一檔`;
export const HOLDING_COST_TOO_LARGE = "持股的總成本不能超過 1 億元";
export const SHARES_REQUIRED = "請輸入買到的股數";

export const PAY_CARD_NOT_CREDIT = "繳卡費要選信用卡";
export const CARD_BILL_NOT_CREDIT = "帳單要填在信用卡";
export const CARD_NEEDS_DUE_DAY = "這張卡還沒設定繳款截止日，請先到設定頁填";
export const STATEMENT_DAY_MISMATCH = "這一天不是這張卡的結帳日";
export const STATEMENT_BEFORE_START = "這張卡開始記帳之前的帳單不用填";
export const BILL_DIFFERENCE_TOO_LARGE = "帳單跟紀錄差超過 1 億元，請確認帳單金額";
export const BILL_ROW_NOT_EDITABLE = "帳單差額只能改分類和備註，要改金額請重新填帳單";
export const BILL_ADJUST_NOT_EDITABLE = "帳單差額的調整不能修改，要改請重新填帳單";

export const RECURRING_INACTIVE = "這個固定收支已停用，請先恢復";
export const NOT_CONFIRM_MODE = "這個固定收支是自動記帳，不用確認";
export const NOT_INCOME_RULE = "這個固定收支不是收入，不能用發薪分配確認";
export const EARLIER_PERIOD_FIRST = "請先處理更早的那一期";
export const PERIOD_DONE = "這一期已經處理過了，請重新整理頁面";
export const PERIOD_NOT_DUE = `這一期還沒到，到期前 ${PENDING_LOOKAHEAD_DAYS} 天才能處理`;
export const PERIOD_NOT_PENDING = "這一期不在待處理裡，請重新整理頁面";
export const RULE_CHANGED = "這個固定收支剛剛被修改了，請重新整理頁面再試一次";
