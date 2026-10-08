import { createHmac } from "node:crypto";
import { safeEqual } from "@/core/crypto";

/** 防重放：Twitch 建議拒絕超過 10 分鐘的訊息 */
const MAX_AGE_MS = 10 * 60 * 1000;

export type EventSubSubscription = {
  id: string;
  type: string;
  status: string;
  condition?: Record<string, string>;
  /** 同一個 Client ID 的訂閱清單是所有環境共用的，要靠 callback 分辨是不是自己建的 */
  transport?: { method: string; callback?: string };
};

export type StreamEvent = {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  /** 只有 stream.online 有 */
  type?: string;
  started_at?: string;
};

export type EventSubMessage =
  | { kind: "rejected"; reason: string }
  /** 簽章正確但內容不是預期格式（Twitch 不該送出，但不能讓它變成 500） */
  | { kind: "malformed"; reason: string }
  | { kind: "verification"; challenge: string }
  | { kind: "notification"; messageId: string; subscription: EventSubSubscription; event: StreamEvent }
  | { kind: "revocation"; messageId: string; subscription: EventSubSubscription }
  | { kind: "unknown"; messageType: string };

export function verifySignature(messageId: string, timestamp: string, rawBody: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(messageId + timestamp + rawBody).digest("hex");
  return safeEqual(signature, expected);
}

/** rawBody 必須是原始字串：先 JSON.parse 再序列化會改變位元組，簽章就對不上 */
export function parseEventSubRequest(headers: Headers, rawBody: string, secret: string, now = new Date()): EventSubMessage {
  const messageId = headers.get("Twitch-Eventsub-Message-Id");
  const timestamp = headers.get("Twitch-Eventsub-Message-Timestamp");
  const signature = headers.get("Twitch-Eventsub-Message-Signature");
  const messageType = headers.get("Twitch-Eventsub-Message-Type");
  if (!messageId || !timestamp || !signature || !messageType) return { kind: "rejected", reason: "缺少 EventSub 標頭" };

  if (!verifySignature(messageId, timestamp, rawBody, signature, secret)) return { kind: "rejected", reason: "簽章不符" };

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Math.abs(now.getTime() - sentAt) > MAX_AGE_MS) return { kind: "rejected", reason: "時間戳過期" };

  let body: { challenge?: unknown; subscription?: EventSubSubscription; event?: StreamEvent };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { kind: "malformed", reason: "body 不是有效的 JSON" };
  }

  switch (messageType) {
    case "webhook_callback_verification":
      if (typeof body.challenge !== "string") return { kind: "malformed", reason: "缺少 challenge" };
      return { kind: "verification", challenge: body.challenge };
    case "notification":
      if (!body.subscription || !body.event) return { kind: "malformed", reason: "缺少 subscription 或 event" };
      return { kind: "notification", messageId, subscription: body.subscription, event: body.event };
    case "revocation":
      if (!body.subscription) return { kind: "malformed", reason: "缺少 subscription" };
      return { kind: "revocation", messageId, subscription: body.subscription };
    default:
      return { kind: "unknown", messageType };
  }
}
