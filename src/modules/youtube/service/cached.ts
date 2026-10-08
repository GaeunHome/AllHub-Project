import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { YoutubeChannel } from "../data/schema";
import { youtubeTags } from "./cache-tags";
import { recheckCandidates, type RecheckCandidate } from "./caption-status";
import { listChannels, recentVideos, videoTitle } from "./channels";
import { getSettingsView, getTranslation, missingApiKeyMessage, type SettingsView, type TranslationView } from "./translation";

// 只給頁面用；寫入流程、排程與翻譯鎖要讀最新資料，直接用其他 service

export async function cachedChannels(): Promise<YoutubeChannel[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.channels);
  return listChannels();
}

export async function cachedRecentVideos(): Promise<Awaited<ReturnType<typeof recentVideos>>> {
  "use cache: remote";
  cacheLife("db");
  // 清單同時顯示頻道名稱與翻譯狀態，三張表任一張改了都要重新讀
  cacheTag(youtubeTags.videos, youtubeTags.channels, youtubeTags.translations);
  return recentVideos();
}

export async function cachedRecheckCandidates(): Promise<RecheckCandidate[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.videos);
  return recheckCandidates();
}

/** 只有末 4 碼與模型設定，金鑰（含密文）不進快取 */
export async function cachedSettingsView(): Promise<SettingsView> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.settings);
  return getSettingsView();
}

export async function cachedMissingApiKeyMessage(): Promise<string | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.settings);
  return missingApiKeyMessage();
}

/** 翻譯鎖（lock_id）只給續翻比對，不進快取 */
export async function cachedTranslation(videoId: string): Promise<TranslationView | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.translation(videoId));
  const row = await getTranslation(videoId);
  if (!row) return null;
  const { id, title, status, sourceKind, sourceCues, translated, error, updatedAt } = row;
  return { id, title, status, sourceKind, sourceCues, translated, error, updatedAt };
}

export async function cachedVideoTitle(videoId: string): Promise<string | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(youtubeTags.videos);
  return videoTitle(videoId);
}
