import type { MonthKey } from "../../lib/month";
import { SAVINGS_PATHS } from "../paths";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 月份只在紀錄頁切換 用網址的 month 參數 */
export const monthHref = (month: MonthKey) => `${SAVINGS_PATHS.records}?month=${month}`;
