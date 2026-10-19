import type { CacheTag } from "@/core/cache";

/** 預報與空氣品質不存資料庫 沒有寫入點 靠效期更新 */
export const weatherTags = {
  settings: "weather:settings",
  external: "weather:external",
} as const satisfies Record<string, CacheTag<"weather">>;
