import { parseChannelInput } from "./parse";

/** YouTube 上的影片頁 */
export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** 站內的翻譯觀看頁；service 與 web 不能讀模組根目錄的 info.ts，模組網址（/youtube）寫在這裡 */
export const watchPagePath = (videoId: string) => `/youtube/watch/${videoId}`;

/** 影片縮圖：用影片 id 組出來、不必呼叫 API；mqdefault 是每支影片都有的 16:9 縮圖（320×180） */
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;

/** 頻道 id 或 @handle：同一個頻道不論從哪裡來（資料庫、oEmbed 的網址）都整理成同一種寫法，讀頭像時當快取 key */
export function youtubeChannelRef(input: string): string | null {
  const channel = parseChannelInput(input);
  if (!channel) return null;
  return channel.kind === "id" ? channel.channelId : `@${channel.handle}`;
}

/** 讀頭像用的頻道頁；只接受頻道 id 或 @handle（或它們的網址），其他字串回 null，不會組出別的網站 */
export function youtubeChannelPageUrl(ref: string): string | null {
  const channel = parseChannelInput(ref);
  if (!channel) return null;
  return channel.kind === "id" ? `https://www.youtube.com/channel/${channel.channelId}` : `https://www.youtube.com/@${encodeURIComponent(channel.handle)}`;
}
