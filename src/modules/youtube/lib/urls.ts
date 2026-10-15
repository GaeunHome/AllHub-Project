import { parseChannelInput } from "./parse";

/** YouTube 上的影片頁 */
export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** 站內的翻譯觀看頁 service 與 web 不能讀根目錄的 info.ts 所以網址寫在這裡 */
export const watchPagePath = (videoId: string) => `/youtube/watch/${videoId}`;

/** 站內的已保留影片 */
export const SAVED_VIDEOS_PATH = "/youtube/saved";

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
  return channel.kind === "id" ? `https://www.youtube.com/channel/${channel.channelId}` : `https://www.youtube.com/@${encodeURIComponent(channel.handle)}`;
}
