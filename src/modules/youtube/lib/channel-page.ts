import { decodeEntities } from "./text";

// 頻道頁的 HTML 沒有公開格式 改版可能失效 讀不到就回 null 畫面退回文字頭像

/** 只認 Google 的圖片網域 被擋時回的同意頁也有 og:image 但那是 YouTube 的通用圖 */
const AVATAR_HOSTS = /(^|\.)(ggpht\.com|googleusercontent\.com|ytimg\.com)$/;
/** 畫面上的頭像最大 44px 三倍多就夠清楚 原圖常是 900px */
const AVATAR_PIXELS = 176;

export function parseChannelId(html: string): string | null {
  return (
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)?.[1] ??
    /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1] ??
    null
  );
}

/** 先讀 og:image 沒有再讀 ytInitialData 裡的頭像 */
export function parseChannelAvatar(html: string): string | null {
  for (const candidate of [ogImage(html), initialDataAvatar(html)]) {
    const url = normalizeAvatar(candidate);
    if (url) return url;
  }
  return null;
}

function ogImage(html: string): string | null {
  const tag = /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i.exec(html)?.[0];
  const content = tag ? /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
  return content ? decodeEntities(content) : null;
}

function initialDataAvatar(html: string): string | null {
  const raw = /"avatar":\{"thumbnails":\[\{"url":"((?:[^"\\]|\\.)+)"/.exec(html)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

function normalizeAvatar(candidate: string | null): string | null {
  if (!candidate) return null;
  const absolute = candidate.startsWith("//") ? `https:${candidate}` : candidate;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !AVATAR_HOSTS.test(parsed.hostname)) return null;
  return absolute.replace(/=s\d+(?=[-?&]|$)/, `=s${AVATAR_PIXELS}`);
}
