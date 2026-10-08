import type { CacheTag } from "@/core/cache";

/** 一張資料表一個 tag：讀取標上讀到的表，寫入讓改到的表失效；即時便箋讀了帳號（cookie、UID），也標帳號的 tag */
export const starrailTags = {
  accounts: "starrail:accounts",
  checkins: "starrail:checkins",
} as const satisfies Record<string, CacheTag<"starrail">>;
