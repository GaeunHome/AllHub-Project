import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { TwitchStreamer } from "../data/schema";
import { twitchTags } from "./cache-tags";
import { listStreamers, recentEvents } from "./streamers";

// 只給頁面用；寫入流程與排程要讀最新資料，直接用 streamers.ts

export async function cachedStreamers(): Promise<TwitchStreamer[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(twitchTags.streamers);
  return listStreamers();
}

export async function cachedRecentEvents(limit = 20): Promise<Awaited<ReturnType<typeof recentEvents>>> {
  "use cache: remote";
  cacheLife("db");
  // 主播名稱也是從主播表讀的，刪除主播後要改顯示「已刪除」
  cacheTag(twitchTags.events, twitchTags.streamers);
  return recentEvents(limit);
}
