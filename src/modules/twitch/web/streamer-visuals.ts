import "server-only";
import { cacheKeyIds, mergeStreamerVisuals } from "../lib/visuals";
import { cachedGameArt, cachedLiveStreams, cachedStreamerProfiles, cachedStreamers } from "../service/cached";

/**
 * Twitch 頁與首頁共用讀法與快取 key 頭像與直播狀態分開快取
 * Helix 不能用時退回資料庫存的頭像與 EventSub 寫的開台狀態
 */
export async function followedStreamerVisuals(userId: string) {
  const streamers = await cachedStreamers(userId);
  if (streamers.length === 0) return [];
  const ids = cacheKeyIds(streamers.map((s) => s.broadcasterId));
  const [profiles, streams] = await Promise.all([cachedStreamerProfiles(ids), cachedLiveStreams(ids)]);
  const games = await cachedGameArt(cacheKeyIds((streams ?? []).map((s) => s.gameId)));
  return mergeStreamerVisuals(streamers, { profiles, streams, games });
}
