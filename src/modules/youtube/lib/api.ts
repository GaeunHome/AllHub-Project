import "server-only";
import { youtubeEnv } from "@/core/env";
import { externalFetch } from "@/core/external-url";
import { parseChannelAvatar, parseChannelId } from "./channel-page";
import { parseOembed, type VideoInfo } from "./oembed";
import { youtubeChannelPageUrl, youtubeWatchUrl } from "./urls";
import { callbackToken, parseFeed, topicFor, type FeedEntry } from "./websub";
import { YOUTUBE_TIMEOUT_MS, fetchYoutubePage } from "./youtube-fetch";

const HUB = "https://pubsubhubbub.appspot.com/subscribe";
/** 頭像只是裝飾 YouTube 慢的時候不值得等滿 15 秒 */
const AVATAR_TIMEOUT_MS = 5_000;
/** hub 實際給的租約通常是 5 天 續訂排程每天跑 */
const LEASE_SECONDS = 432000;

/** hub 回了 202 204 以外的狀態 畫面摘要只看狀態碼 不顯示 message 裡的回應原文 */
export class HubError extends Error {
  name = "HubError";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const get = (url: string) => fetchYoutubePage(url);

/** 把 @handle 換成頻道 id 沒有官方免金鑰的做法 只能讀頻道頁 HTML 改版可能失效 */
export async function resolveHandle(handle: string): Promise<{ channelId: string; thumbnail: string | null } | null> {
  const response = await get(`https://www.youtube.com/@${encodeURIComponent(handle)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`YouTube 回應 ${response.status}`);

  const html = await response.text();
  const channelId = parseChannelId(html);
  if (!channelId) return null;
  return { channelId, thumbnail: parseChannelAvatar(html) };
}

/**
 * 讀頻道頁的 og:image 是非官方做法 ref 是頻道 id 或 @handle
 * 頻道不存在或讀不到回 null 連線錯誤照常丟出
 */
export async function fetchChannelAvatar(ref: string): Promise<string | null> {
  const url = youtubeChannelPageUrl(ref);
  if (!url) return null;
  const response = await fetchYoutubePage(url, { timeoutMs: AVATAR_TIMEOUT_MS });
  if (!response.ok) return null;
  return parseChannelAvatar(await response.text());
}

/**
 * 非官方做法 Shorts 頁回 200 一般影片會轉址到 /watch 被擋或到同意頁回 null
 * 連線錯誤與逾時照常丟出 timeoutMs 給排程調短
 */
export async function checkIsShort(videoId: string, { timeoutMs }: { timeoutMs?: number } = {}): Promise<boolean | null> {
  const response = await fetchYoutubePage(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, { redirect: "manual", timeoutMs });
  // 只看狀態碼與轉址目標 不必下載 Shorts 頁的 HTML
  await response.body?.cancel();
  if (response.status === 200) return true;
  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location || !URL.canParse(location, "https://www.youtube.com")) return null;
  return new URL(location, "https://www.youtube.com").pathname === "/watch" ? false : null;
}

/**
 * 官方公開的頻道 RSS 確認頻道存在並取得名稱 查不到回 null
 * entries 給追蹤時補影片與每天清理找 Shorts timeoutMs 給排程調短
 */
export async function fetchChannelFeed(channelId: string, { timeoutMs }: { timeoutMs?: number } = {}): Promise<{ title: string | null; entries: FeedEntry[] } | null> {
  const response = await fetchYoutubePage(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { timeoutMs });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`YouTube 回應 ${response.status}`);
  return parseFeed(await response.text());
}

function websubCallbackUrl(): string {
  return `${youtubeEnv().PUBLIC_BASE_URL.replace(/\/$/, "")}/api/youtube/websub`;
}

/** callback 帶上跟頻道綁定的 k hub 確認時會原樣帶回 沒有 k 的一律拒絕 */
function callbackFor(channelId: string): string {
  const url = new URL(websubCallbackUrl());
  url.searchParams.set("k", callbackToken(channelId, youtubeEnv().YOUTUBE_WEBSUB_SECRET));
  return url.toString();
}

/** 向 WebSub hub 訂閱或取消 hub 之後才非同步用 GET 到 callback 確認 */
export async function hubRequest(mode: "subscribe" | "unsubscribe", channelId: string): Promise<void> {
  const response = await externalFetch(
    HUB,
    {
      method: "POST",
      body: new URLSearchParams({
        "hub.callback": callbackFor(channelId),
        "hub.topic": topicFor(channelId),
        "hub.mode": mode,
        "hub.verify": "async",
        "hub.secret": youtubeEnv().YOUTUBE_WEBSUB_SECRET,
        "hub.lease_seconds": String(LEASE_SECONDS),
      }),
    },
    { timeoutMs: YOUTUBE_TIMEOUT_MS },
  );
  if (response.status === 202 || response.status === 204) return;
  const text = (await response.text()).trim().slice(0, 200);
  throw new HubError(response.status, `hub 回應 ${response.status}${text ? `：${text}` : ""}`);
}

/** oEmbed 官方又免金鑰 任何影片都拿得到標題 失敗回 null 不影響翻譯 */
export async function fetchVideoTitle(videoId: string): Promise<string | null> {
  return (await fetchVideoInfo(videoId))?.title ?? null;
}

/** 用 oEmbed 讀任何影片 影片不存在 私人或連線失敗都回 null 畫面照常顯示 */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    const response = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(videoId))}`);
    if (!response.ok) return null;
    return parseOembed(await response.json());
  } catch {
    return null;
  }
}
