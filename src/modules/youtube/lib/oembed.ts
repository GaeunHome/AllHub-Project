/** oEmbed 是官方、免金鑰的影片資訊；讀不到的欄位給 null */
export type VideoInfo = { title: string | null; channelName: string | null; channelUrl: string | null };

export function parseOembed(data: unknown): VideoInfo {
  const record = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return { title: text(record.title), channelName: text(record.author_name), channelUrl: youtubeUrl(text(record.author_url)) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** 頻道網址會變成畫面上的連結，只收 YouTube 的 https 網址 */
function youtubeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)youtube\.com$/.test(url.hostname) ? value : null;
  } catch {
    return null;
  }
}
