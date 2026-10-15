import type { MonthKey } from "../../lib/month";
import { SAVINGS_PATHS } from "../paths";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 總覽與紀錄頁都用網址的 month 參數切換月份 */
export type MonthBasePath = typeof SAVINGS_PATHS.overview | typeof SAVINGS_PATHS.records;

export const monthHref = (month: MonthKey, basePath: MonthBasePath = SAVINGS_PATHS.overview) => `${basePath}?month=${month}`;
