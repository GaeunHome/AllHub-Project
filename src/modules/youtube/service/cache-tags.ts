import type { CacheTag } from "@/core/cache";

/** 一張資料表一個 tag：讀取標上讀到的表，寫入讓改到的表失效；翻譯另外依影片細分 */
export const youtubeTags = {
  channels: "youtube:channels",
  follows: "youtube:follows",
  videos: "youtube:videos",
  settings: "youtube:settings",
  translations: "youtube:translations",
  /** 頻道頁的頭像與 oEmbed 影片資訊：外部資料不存資料庫，沒有寫入點，靠效期更新 */
  external: "youtube:external",
  /** 觀看頁只讀一支影片的翻譯：翻譯每批寫回時，別支影片的快取不受影響 */
  translation: (videoId: string): CacheTag<"youtube"> => `youtube:translation:${videoId}`,
} as const satisfies Record<string, CacheTag<"youtube"> | ((videoId: string) => CacheTag<"youtube">)>;
