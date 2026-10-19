import type { AccountKind } from "../lib/kinds";
import type { UNCATEGORIZED_KEY } from "../lib/ledger";
import type { MonthKey } from "../lib/month";

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

type RecordsFilter = { month?: MonthKey | null; account?: number; category?: number | typeof UNCATEGORIZED_KEY };

/** 紀錄頁的網址 本月不帶 month 帳戶與分類帶上後紀錄頁一打開就篩好 */
export function recordsHref({ month = null, account, category }: RecordsFilter = {}): string {
  const params = new URLSearchParams();
  if (month !== null) params.set("month", month);
  if (account !== undefined) params.set("account", String(account));
  if (category !== undefined) params.set("category", String(category));
  const query = params.toString();
  return query ? `${SAVINGS_PATHS.records}?${query}` : SAVINGS_PATHS.records;
}

/** 月份只在紀錄頁切換 換月份的連結不帶帳戶與分類 篩選照舊 */
export const monthHref = (month: MonthKey) => recordsHref({ month });

/** 每月收支的長條連到那個月 本月不帶 month */
export const monthRecordsHref = (month: MonthKey, current: MonthKey) => recordsHref({ month: month === current ? null : month });
