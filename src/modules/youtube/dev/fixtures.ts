import type { ReactElement, ReactNode } from "react";
import { HOUR_MS } from "@/core/time";
import type { TestDb } from "@/dev/test-db";
import { youtubeChannels, youtubeFollows, type TranslationStatus, type ZhCaptionStatus } from "../data/schema";

// YouTube 的測試共用的假資料與小工具 只有測試可以 import

export const VIDEO_ID = "dQw4w9WgXcQ";
export const CHANNEL_ID = "UC" + "a".repeat(22);
export const OTHER_CHANNEL_ID = "UC" + "b".repeat(22);

/** 只有人工韓文字幕的影片 listCaptionTracks 會回這個 */
export const KOREAN_TRACKS = { ok: true, tracks: [{ languageCode: "ko", automatic: false, translated: false }] };

/** 寫進頻道 預設是 CHANNEL_ID 名稱 뉴진스 已經訂閱 */
export const insertChannel = (db: TestDb, values: Partial<typeof youtubeChannels.$inferInsert> = {}) =>
  db.insert(youtubeChannels).values({ channelId: CHANNEL_ID, title: "뉴진스", subscriptionStatus: "subscribed", ...values });

export const follow = (db: TestDb, userId: string, channelId = CHANNEL_ID, notifyEnabled = true) => db.insert(youtubeFollows).values({ userId, channelId, notifyEnabled });

type FeedVideoFields = {
  title: string;
  publishedAt: Date | null;
  zhCaptions: ZhCaptionStatus;
  zhCaptionsCheckedAt: Date | null;
  channelId: string;
  channelTitle: string | null;
  channelThumbnail: string | null;
  translationStatus: TranslationStatus | null;
};

/** 影片清單上的一支 欄位跟 recentVideos 一樣 預設 3 小時前發布 沒有中文字幕 還沒檢查過 */
export const feedVideo = (videoId: string, overrides: Partial<FeedVideoFields> = {}): FeedVideoFields & { videoId: string } => ({
  videoId,
  title: `影片 ${videoId}`,
  publishedAt: new Date(Date.now() - 3 * HOUR_MS),
  zhCaptions: "no",
  zhCaptionsCheckedAt: null,
  channelId: CHANNEL_ID,
  channelTitle: "模擬頻道",
  channelThumbnail: null,
  translationStatus: null,
  ...overrides,
});

type SavedVideoFields = { title: string | null; channelTitle: string | null; pinned: boolean; savedAt: Date; translationStatus: TranslationStatus | null };

/** 保留清單上的一部 欄位跟 listSavedVideos 一樣 預設是 3 小時前手動保留的 */
export const savedVideo = (videoId: string, overrides: Partial<SavedVideoFields> = {}): SavedVideoFields & { videoId: string } => ({
  videoId,
  title: `影片 ${videoId}`,
  channelTitle: "模擬頻道",
  pinned: true,
  savedAt: new Date(Date.now() - 3 * HOUR_MS),
  translationStatus: null,
  ...overrides,
});

/** 伺服器元件回傳的元素樹裡第一個這種元件 不實際算繪 client 元件要瀏覽器的 router */
export function findByType(node: ReactNode, type: unknown): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object" || !("type" in node)) return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.type === type ? element : findByType(element.props.children, type);
}
