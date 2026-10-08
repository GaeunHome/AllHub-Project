import { after } from "next/server";
import { twitchEnv } from "@/core/env";
import { parseEventSubRequest } from "../../lib/eventsub";
import { handleNotification, handleRevocation } from "../../service/streamers";

/** Twitch EventSub Webhook 接收端；不需要登入，靠 HMAC 簽章驗證來源 */
export async function POST(request: Request) {
  const raw = await request.text();
  const message = parseEventSubRequest(request.headers, raw, twitchEnv().TWITCH_EVENTSUB_SECRET);

  switch (message.kind) {
    case "rejected":
      console.warn(`[twitch] 拒絕 EventSub 請求：${message.reason}`);
      return new Response(null, { status: 403 });
    case "malformed":
      console.warn(`[twitch] EventSub 內容格式不符：${message.reason}`);
      return new Response(null, { status: 400 });
    case "verification":
      return new Response(message.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    case "notification":
      // 寫紀錄後立刻回 204，查直播資訊（可能重試數秒）與推通知放到回應之後，避免 Twitch 等太久判定失敗
      await handleNotification(message.messageId, message.subscription, message.event, { defer: after });
      return new Response(null, { status: 204 });
    case "revocation":
      await handleRevocation(message.subscription);
      return new Response(null, { status: 204 });
    default:
      return new Response(null, { status: 204 });
  }
}
