import "server-only";
import { logError } from "@/core/errors";
import { fetchChannelAvatar, fetchVideoInfo } from "../lib/api";
import type { VideoInfo } from "../lib/oembed";

/** 頭像只是裝飾 被擋或逾時都回 null 畫面退回資料庫的頭像或文字頭像 */
export async function channelAvatar(ref: string): Promise<string | null> {
  try {
    return await fetchChannelAvatar(ref);
  } catch (error) {
    logError("youtube", "讀取頻道頭像失敗", error);
    return null;
  }
}

/** 標題與頻道只是顯示用的 被擋或逾時都回 null 畫面照常顯示 翻譯也照常開始 */
export async function videoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    return await fetchVideoInfo(videoId);
  } catch (error) {
    logError("youtube", "讀取影片資訊失敗", error);
    return null;
  }
}
