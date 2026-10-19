import { parseChannelInput } from "./parse";
import type { DownloadFormat } from "./download";
import type { SubtitleMode } from "./subtitles/format";

// service 與 web 不能讀根目錄的 info.ts 站內與 YouTube 的網址寫在這裡

/** 站內的 YouTube 頁 */
export const YOUTUBE_PAGE_PATH = "/youtube";

/** 站內的翻譯觀看頁 */
export const watchPagePath = (videoId: string) => `${YOUTUBE_PAGE_PATH}/watch/${videoId}`;

/** 站內的已保留影片 */
export const SAVED_VIDEOS_PATH = `${YOUTUBE_PAGE_PATH}/saved`;

/** 下載翻好的字幕 web/routes/subtitle-download.ts 處理 */
export const subtitleDownloadPath = (videoId: string, lang: SubtitleMode, format: DownloadFormat) => `/api/youtube/subtitles/${videoId}?format=${format}&lang=${lang}`;

/** YouTube 上的影片頁 */
export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** YouTube 上的頻道頁 頻道 id 是 UC 開頭的那種 */
export const youtubeChannelUrl = (channelId: string) => `https://www.youtube.com/channel/${channelId}`;

/** YouTube 上 @handle 的頻道頁 handle 可以用各國文字 放進網址要編碼 */
export const youtubeHandleUrl = (handle: string) => `https://www.youtube.com/@${encodeURIComponent(handle)}`;

/**
 * 只收 YouTube 與子網域的 https 網址
 * 字幕下載網址會被拿去請求 oEmbed 的頻道網址會變成畫面上的連結
 */
export function isYoutubeHttpsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (host === "youtube.com" || host.endsWith(".youtube.com"));
}

/** 用影片 id 組出來不必呼叫 API mqdefault 是每支影片都有的 16:9 縮圖 */
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;

/** 不論來自資料庫或 oEmbed 都整理成頻道 id 或 @handle 讀頭像時當快取 key */
export function youtubeChannelRef(input: string): string | null {
  const channel = parseChannelInput(input);
  if (!channel) return null;
  return channel.kind === "id" ? channel.channelId : `@${channel.handle}`;
}

/** 讀頭像用的頻道頁 只收頻道 id 或 @handle 與它們的網址 不會組出別的網站 */
export function youtubeChannelPageUrl(ref: string): string | null {
  const channel = parseChannelInput(ref);
  if (!channel) return null;
  return channel.kind === "id" ? youtubeChannelUrl(channel.channelId) : youtubeHandleUrl(channel.handle);
}
