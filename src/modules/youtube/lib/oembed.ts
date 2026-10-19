import { asRecord, text } from "@/core/json";
import { isYoutubeHttpsUrl } from "./urls";

/** oEmbed 是官方免金鑰的影片資訊 讀不到的欄位給 null */
export type VideoInfo = { title: string | null; channelName: string | null; channelUrl: string | null };

export function parseOembed(data: unknown): VideoInfo {
  const record = asRecord(data) ?? {};
  return { title: text(record.title), channelName: text(record.author_name), channelUrl: youtubeUrl(text(record.author_url)) };
}

/** 頻道網址會變成畫面上的連結 只收 YouTube 的 https 網址 */
function youtubeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return isYoutubeHttpsUrl(new URL(value)) ? value : null;
  } catch {
    return null;
  }
}
