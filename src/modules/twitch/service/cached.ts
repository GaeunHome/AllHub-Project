import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { GameArt, LiveStream, StreamerProfile } from "../lib/visuals";
import { twitchTags } from "./cache-tags";
import { listFollowedStreamers, recentEvents, type FollowedStreamer } from "./streamers";
import { gameArt, liveStreams, streamerProfiles } from "./visuals";

// 只給頁面用；寫入流程與排程要讀最新資料，直接用 streamers.ts
// userId 一律是頁面從 session 拿到的登入者，會成為快取 key：每個人只讀到自己追蹤的主播

export async function cachedStreamers(userId: string): Promise<FollowedStreamer[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(twitchTags.streamers, twitchTags.follows);
  return listFollowedStreamers(userId);
}

export async function cachedRecentEvents(userId: string, limit = 20): Promise<Awaited<ReturnType<typeof recentEvents>>> {
  "use cache: remote";
  cacheLife("db");
  // 主播名稱來自主播表、要不要列出來看追蹤表：取消追蹤後那位主播的紀錄就不再出現
  cacheTag(twitchTags.events, twitchTags.streamers, twitchTags.follows);
  return recentEvents(userId, limit);
}

// 以下是 Helix 的外部資料（不存資料庫）：參數是明確的主播或遊戲 id（排序後），null 代表 Helix 不能用，畫面退回資料庫的資料

export async function cachedStreamerProfiles(broadcasterIds: string[]): Promise<StreamerProfile[] | null> {
  "use cache: remote";
  cacheTag(twitchTags.external);
  const profiles = await streamerProfiles(broadcasterIds);
  // 出錯時幾分鐘後再試，不要一整天都是文字頭像
  if (profiles) cacheLife("avatar");
  else cacheLife("external");
  return profiles;
}

export async function cachedLiveStreams(broadcasterIds: string[]): Promise<LiveStream[] | null> {
  "use cache: remote";
  cacheLife("live");
  // EventSub 寫入開關台時會讓主播表的 tag 失效，直播狀態跟著重抓，不必等 2 分鐘
  cacheTag(twitchTags.external, twitchTags.streamers);
  return liveStreams(broadcasterIds);
}

export async function cachedGameArt(gameIds: string[]): Promise<GameArt[] | null> {
  "use cache: remote";
  cacheTag(twitchTags.external);
  const art = await gameArt(gameIds);
  if (art) cacheLife("avatar");
  else cacheLife("external");
  return art;
}
