import type { CacheTag } from "@/core/cache";

/** 一張資料表一個 tag：讀取標上讀到的表，寫入讓改到的表失效 */
export const twitchTags = {
  streamers: "twitch:streamers",
  events: "twitch:events",
} as const satisfies Record<string, CacheTag<"twitch">>;
