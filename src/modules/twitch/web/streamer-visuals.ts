import "server-only";
import { cacheKeyIds, mergeStreamerVisuals } from "../lib/visuals";
import { cachedGameArt, cachedLiveStreams, cachedStreamerProfiles, cachedStreamers } from "../service/cached";

/** Twitch 頁與首頁共用同一套讀法與快取 key：頭像（一天）與直播狀態（2 分鐘）分開快取；Helix 不能用（沒設定憑證或出錯）時是 null，退回資料庫存的頭像與 EventSub 寫的開台狀態 */
export async function followedStreamerVisuals(userId: string) {
  const streamers = await cachedStreamers(userId);
  if (streamers.length === 0) return [];
  const ids = cacheKeyIds(streamers.map((s) => s.broadcasterId));
  const [profiles, streams] = await Promise.all([cachedStreamerProfiles(ids), cachedLiveStreams(ids)]);
  const games = await cachedGameArt(cacheKeyIds((streams ?? []).map((s) => s.gameId)));
  return mergeStreamerVisuals(streamers, { profiles, streams, games });
}
