import type { CacheTag } from "@/core/cache";

/**
 * 一張表一個 tag 讀取標上讀到的表 寫入讓改到的表失效
 * HoYoLAB 的資料讀了帳號的 cookie 與 UID 所以也標帳號的 tag
 */
export const starrailTags = {
  accounts: "starrail:accounts",
  checkins: "starrail:checkins",
} as const satisfies Record<string, CacheTag<"starrail">>;
