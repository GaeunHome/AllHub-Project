import type { CacheTag } from "@/core/cache";

/** 一張表一個 tag 紀錄一改 餘額 統計與每個月的明細都要重算 不依月份細分 */
export const savingsTags = {
  purposes: "savings:purposes",
  categories: "savings:categories",
  accounts: "savings:accounts",
  recurring: "savings:recurring",
  transactions: "savings:transactions",
} as const satisfies Record<string, CacheTag<"savings">>;
