import type { CacheTag } from "@/core/cache";
import type { MonthKey } from "../lib/month";

/** 紀錄依月份細分：記一筆只讓那個月份與累計失效；改名、刪除項目會改到所有月份的紀錄，用 entries 一次失效 */
export const savingsTags = {
  goals: "savings:goals",
  entries: "savings:entries",
  totals: "savings:totals",
  month: (month: MonthKey): CacheTag<"savings"> => `savings:month:${month}`,
} as const satisfies Record<string, CacheTag<"savings"> | ((month: MonthKey) => CacheTag<"savings">)>;
