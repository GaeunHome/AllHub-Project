import type { MonthKey } from "../../lib/month";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const monthHref = (month: MonthKey) => `/savings?month=${month}`;
