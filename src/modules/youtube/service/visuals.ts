import "server-only";
import { logError } from "@/core/errors";
import { fetchChannelAvatar } from "../lib/api";

/** 頭像只是裝飾 被擋或逾時都回 null 畫面退回資料庫的頭像或文字頭像 */
export async function channelAvatar(ref: string): Promise<string | null> {
  try {
    return await fetchChannelAvatar(ref);
  } catch (error) {
    logError("youtube", "讀取頻道頭像失敗", error);
    return null;
  }
}
