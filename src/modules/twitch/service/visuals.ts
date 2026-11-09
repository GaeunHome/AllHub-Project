import "server-only";
import { hasTwitchEnv } from "@/core/env";
import { logError } from "@/core/errors";
import { logMissing } from "@/core/json";
import { getGames, getLiveStreams, getSchedule, getUsersById } from "../lib/api";
import { parseSchedule, type StreamSchedule } from "../lib/schedule";
import { toGameArt, toLiveStream, toProfile, type GameArt, type LiveStream, type StreamerProfile } from "../lib/visuals";

// 頭像 直播狀態與封面只是附加資訊 沒設定憑證或 Helix 出錯都回 null
// 畫面退回資料庫裡的頭像與開台狀態 不顯示錯誤

async function fromHelix<T>(what: string, ids: string[], call: () => Promise<T[]>): Promise<T[] | null> {
  // 先檢查設定 不讓 twitchEnv 的驗證錯誤冒出來
  if (!hasTwitchEnv()) return null;
  if (ids.length === 0) return [];
  try {
    return await call();
  } catch (error) {
    // 回應原文可能帶有設定內容 只記錯誤種類與狀態碼
    logError("twitch", `${what}失敗`, error);
    return null;
  }
}

export async function streamerProfiles(broadcasterIds: string[]): Promise<StreamerProfile[] | null> {
  return fromHelix("讀取主播頭像", broadcasterIds, async () => (await getUsersById(broadcasterIds)).map(toProfile));
}

export async function liveStreams(broadcasterIds: string[]): Promise<LiveStream[] | null> {
  return fromHelix("讀取直播狀態", broadcasterIds, async () => (await getLiveStreams(broadcasterIds)).map(toLiveStream));
}

export async function gameArt(gameIds: string[]): Promise<GameArt[] | null> {
  return fromHelix("讀取遊戲封面", gameIds, async () => (await getGames(gameIds)).map(toGameArt));
}

/** configured 是 false 時畫面不放時間表 schedule 是 null 是讀不到 */
export type ScheduleRead = { configured: boolean; schedule: StreamSchedule | null };

export async function streamSchedule(broadcasterId: string): Promise<ScheduleRead> {
  if (!hasTwitchEnv()) return { configured: false, schedule: null };
  try {
    const json = await getSchedule(broadcasterId);
    if (json === null) return { configured: true, schedule: { segments: [], vacation: null } };
    const parsed = parseSchedule(json);
    logMissing("twitch", "開台時間表", parsed ? parsed.missing : ["data"], broadcasterId);
    return { configured: true, schedule: parsed?.schedule ?? null };
  } catch (error) {
    logError("twitch", "讀取開台時間表失敗", error);
    return { configured: true, schedule: null };
  }
}
