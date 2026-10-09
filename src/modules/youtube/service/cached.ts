import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { fetchVideoInfo } from "../lib/api";
import type { VideoInfo } from "../lib/oembed";
import { youtubeTags } from "./cache-tags";
import { recheckCandidates, type RecheckCandidate } from "./caption-status";
import { followedVideoTitle, listFollowedChannels, recentVideos, videoChannel, type FollowedChannel } from "./channels";
import { getSettingsView, getTranslation, missingApiKeyMessage, type SettingsView, type TranslationView } from "./translation";
import { channelAvatar } from "./visuals";

// 只給頁面用；寫入流程、排程與翻譯鎖要讀最新資料，直接用其他 service
// userId 一律是頁面從 session 拿到的登入者，會成為快取 key：追蹤、影片清單與翻譯設定每個人各自一份；翻譯是共用的，只用影片 id

export async function cachedChannels(userId: string): Promise<FollowedChannel[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.channels, youtubeTags.follows);
  return listFollowedChannels(userId);
}

export async function cachedRecentVideos(userId: string): Promise<Awaited<ReturnType<typeof recentVideos>>> {
  "use cache: remote";
  cacheLife("db");
  // 清單看追蹤表決定列哪些影片，同時顯示頻道名稱與翻譯狀態，四張表任一張改了都要重新讀
  cacheTag(youtubeTags.videos, youtubeTags.channels, youtubeTags.follows, youtubeTags.translations);
  return recentVideos(userId);
}

export async function cachedRecheckCandidates(userId: string): Promise<RecheckCandidate[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.videos, youtubeTags.follows);
  return recheckCandidates(userId);
}

/** 只有末 4 碼與模型設定，金鑰（含密文）不進快取 */
export async function cachedSettingsView(userId: string): Promise<SettingsView> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.settings);
  return getSettingsView(userId);
}

export async function cachedMissingApiKeyMessage(userId: string): Promise<string | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.settings);
  return missingApiKeyMessage(userId);
}

/** 翻譯是共用的，所有人讀同一份；翻譯鎖（lock_id）只給續翻比對、發起人的專有名詞表只給續翻用，都不進快取 */
export async function cachedTranslation(videoId: string): Promise<TranslationView | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.translation(videoId));
  const row = await getTranslation(videoId);
  if (!row) return null;
  const { id, title, status, sourceKind, sourceCues, translated, error, updatedAt, requestedBy } = row;
  return { id, title, status, sourceKind, sourceCues, translated, error, updatedAt, requestedBy };
}

/** 只查得到自己追蹤頻道的影片 */
export async function cachedVideoTitle(userId: string, videoId: string): Promise<string | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.videos, youtubeTags.follows);
  return followedVideoTitle(userId, videoId);
}

/** 只查得到自己追蹤頻道的影片；其他影片回 null，畫面改用 oEmbed */
export async function cachedVideoChannel(userId: string, videoId: string): Promise<Awaited<ReturnType<typeof videoChannel>>> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.videos, youtubeTags.channels, youtubeTags.follows);
  return videoChannel(userId, videoId);
}

/** 頻道頁的頭像（外部資料，不存資料庫）；參數是頻道 id 或 @handle */
export async function cachedChannelAvatar(ref: string): Promise<string | null> {
  "use cache: remote";
  cacheTag(youtubeTags.external);
  const avatar = await channelAvatar(ref);
  // 讀不到多半是 YouTube 暫時擋下雲端主機，幾分鐘後再試，不要一整天都是文字頭像
  if (avatar) cacheLife("avatar");
  else cacheLife("external");
  return avatar;
}

/** 沒追蹤的影片用 oEmbed 補標題與頻道（外部資料，不存資料庫） */
export async function cachedVideoInfo(videoId: string): Promise<VideoInfo | null> {
  "use cache: remote";
  cacheTag(youtubeTags.external);
  const info = await fetchVideoInfo(videoId);
  if (info) cacheLife("avatar");
  else cacheLife("external");
  return info;
}
