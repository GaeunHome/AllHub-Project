import type { CacheTag } from "@/core/cache";

/** 一張資料表一個 tag：讀取標上讀到的表，寫入讓改到的表失效 */
export const twitchTags = {
  streamers: "twitch:streamers",
  follows: "twitch:follows",
  events: "twitch:events",
  /** Helix 的頭像、直播狀態與遊戲封面：外部資料不存資料庫，靠效期更新 */
  external: "twitch:external",
} as const satisfies Record<string, CacheTag<"twitch">>;
