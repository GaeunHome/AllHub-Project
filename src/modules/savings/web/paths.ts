import type { AccountKind } from "../lib/kinds";

// web 層不能讀模組根目錄的 info.ts 網址集中在這裡 改網址只改一處
export const SAVINGS_PATHS = {
  overview: "/savings",
  records: "/savings/records",
  accounts: "/savings/accounts",
  investments: "/savings/investments",
  recurring: "/savings/recurring",
  settings: "/savings/settings",
  // 打開帳戶頁就跳出新增銀行帳戶的視窗
  addAccount: "/savings/accounts?add=deposit",
} as const;

/** 打開那一頁就跳出新增這種帳戶的視窗 證券帳戶在投資頁 */
export const addAccountPath = (kind: AccountKind) => (kind === "investment" ? `${SAVINGS_PATHS.investments}?add=investment` : `${SAVINGS_PATHS.accounts}?add=${kind}`);

/** 每月固定頁新增時先選好的類型 */
export type RecurringPreset = "salary" | "regular-buy" | "other";

/** 打開每月固定頁就跳出新增的視窗 */
export const addRecurringPath = (preset: RecurringPreset) => `${SAVINGS_PATHS.recurring}?add=${preset}`;

/** 打開每月固定頁就跳出這條的修改視窗 */
export const editRecurringPath = (id: number) => `${SAVINGS_PATHS.recurring}?edit=${id}`;
