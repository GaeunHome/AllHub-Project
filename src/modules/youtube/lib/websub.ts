import { createHmac, timingSafeEqual } from "node:crypto";
import { safeEqual } from "@/core/crypto";
import { connectionProblem, errorKind } from "@/core/errors";
import { codePointToString } from "./code-point";
import { CHANNEL_ID } from "./parse";
import { youtubeWatchUrl } from "./urls";

const TOPIC_BASE = "https://www.youtube.com/xml/feeds/videos.xml";
/** hub 實際給 5 天；設上限是怕租約被設成幾十年後，續訂排程就永遠不會觸發 */
const MAX_LEASE_SECONDS = 10 * 24 * 3600;
const MAX_REASON_LENGTH = 200;

export function topicFor(channelId: string): string {
  return `${TOPIC_BASE}?channel_id=${channelId}`;
}

/** 只認 YouTube 自己的影片 feed，避免被拿來確認任意 topic */
export function channelIdFromTopic(topic: string): string | null {
  try {
    const url = new URL(topic);
    if (`${url.origin}${url.pathname}` !== TOPIC_BASE) return null;
    const id = url.searchParams.get("channel_id");
    return id && CHANNEL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** hub 的 GET 確認沒有簽章：callback 帶上跟頻道綁定、猜不到的 k，別人就無法偽造確認或用自己的 secret 代訂 */
export function callbackToken(channelId: string, secret: string): string {
  return createHmac("sha256", secret).update(`websub:${channelId}`).digest("hex");
}

export function verifyCallbackToken(channelId: string, token: string | undefined, secret: string): boolean {
  return Boolean(token) && safeEqual(token!, callbackToken(channelId, secret));
}

/** WebSub 的 X-Hub-Signature：sha1=hex(HMAC-SHA1(secret, 原始 body)) */
export function verifyHubSignature(rawBody: string, header: string | null, secret: string): boolean {
  const match = /^sha1=([0-9a-f]{40})$/i.exec(header ?? "");
  if (!match) return false;
  const expected = createHmac("sha1", secret).update(rawBody, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(match[1], "hex"));
}

export type FeedEntry = {
  videoId: string;
  channelId: string;
  title: string;
  published: Date | null;
  url: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(text);
  if (cdata) return cdata[1];
  return text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex) => codePointToString(parseInt(hex, 16)) ?? whole)
    .replace(/&#(\d+);/g, (whole, dec) => codePointToString(Number(dec)) ?? whole)
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name])
    .trim();
}

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]) : null;
}

/** 只用到少數固定標籤，小型解析就夠、不必引入 XML 套件；刪除通知是 at:deleted-entry，自然會被略過 */
export function parseFeed(xml: string): { title: string | null; entries: FeedEntry[] } {
  const firstEntry = xml.search(/<entry[\s>]/);
  const head = firstEntry < 0 ? xml : xml.slice(0, firstEntry);

  const entries: FeedEntry[] = [];
  for (const [, body] of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const videoId = tag(body, "yt:videoId");
    const channelId = tag(body, "yt:channelId");
    if (!videoId || !channelId) continue;

    const published = new Date(tag(body, "published") ?? "");
    const link = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(body)?.[1];
    entries.push({
      videoId,
      channelId,
      title: tag(body, "title") ?? "",
      published: Number.isNaN(published.getTime()) ? null : published,
      url: link ? decodeXml(link) : youtubeWatchUrl(videoId),
    });
  }
  return { title: tag(head, "title"), entries };
}

/** token 是 callback 網址上的 k（hub 會原樣帶回），交給 verifyCallbackToken 驗證 */
export type Verification =
  | { mode: "subscribe" | "unsubscribe"; topic: string; challenge: string; leaseSeconds?: number; token?: string }
  | { mode: "denied"; topic: string; reason?: string; token?: string };

/** hub 用 GET 確認訂閱／退訂，或通知訂閱被拒（denied）；參數不完整回 null */
export function parseVerification(params: URLSearchParams): Verification | null {
  const mode = params.get("hub.mode");
  const topic = params.get("hub.topic");
  if (!topic) return null;
  const token = params.get("k") ?? undefined;
  if (mode === "denied") {
    // reason 會寫進頻道狀態顯示在畫面上，任何人都能送，要限制長度
    const reason = params.get("hub.reason");
    return { mode, topic, reason: reason === null ? undefined : [...reason].slice(0, MAX_REASON_LENGTH).join(""), token };
  }
  if (mode !== "subscribe" && mode !== "unsubscribe") return null;

  const challenge = params.get("hub.challenge");
  if (!challenge) return null;
  const lease = params.get("hub.lease_seconds");
  if (lease !== null && (!/^\d+$/.test(lease) || Number(lease) === 0)) return null;
  return { mode, topic, challenge, leaseSeconds: lease === null ? undefined : Math.min(Number(lease), MAX_LEASE_SECONDS), token };
}

/** 訂閱失敗的原因會寫進頻道狀態、顯示在畫面上：只放中文摘要，錯誤原文可能是英文或夾帶 hub 的回應；用名稱判斷 HubError，這裡才不必載入 server-only 的 api.ts */
export function subscriptionFailure(error: unknown): string {
  return `訂閱失敗：${connectionProblem(error, "WebSub hub") ?? hubProblem(error)}`;
}

function hubProblem(error: unknown): string {
  const status = errorKind(error) === "HubError" ? (error as { status?: unknown }).status : undefined;
  if (typeof status !== "number") return `發生錯誤（${errorKind(error)}）`;
  if (status === 429) return "hub 請求太頻繁（429），稍後會自動重試";
  if (status >= 500) return `hub 暫時無法使用（${status}），稍後會自動重試`;
  return `hub 拒絕訂閱請求（${status}），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址`;
}
