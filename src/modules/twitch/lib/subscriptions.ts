import { connectionProblem, errorKind } from "@/core/errors";

type SubscriptionFields = { onlineSubscriptionId: string | null; offlineSubscriptionId: string | null; subscriptionStatus: string | null };

/** 開台、關台兩個訂閱都建好，狀態也不是失敗，才收得到通知 */
export function subscriptionsHealthy({ onlineSubscriptionId, offlineSubscriptionId, subscriptionStatus }: SubscriptionFields): boolean {
  return Boolean(onlineSubscriptionId && offlineSubscriptionId && !subscriptionStatus?.includes("失敗"));
}

/** 訂閱失敗的原因會寫進狀態、顯示在畫面上：只放中文摘要，錯誤原文可能是英文或夾帶 Twitch 的回應；用名稱判斷 TwitchApiError，這裡才不必載入 server-only 的 api.ts */
export function subscriptionFailure(error: unknown): string {
  return `訂閱失敗：${connectionProblem(error, "Twitch") ?? twitchProblem(error)}`;
}

function twitchProblem(error: unknown): string {
  const status = errorKind(error) === "TwitchApiError" ? (error as { status?: unknown }).status : undefined;
  if (typeof status !== "number") return `發生錯誤（${errorKind(error)}）`;
  if (status === 400) return "Twitch 拒絕這個請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址";
  if (status === 401 || status === 403) return `Twitch 拒絕授權（${status}），請確認 TWITCH_CLIENT_ID 與 TWITCH_CLIENT_SECRET`;
  // 加主播時不比對既有訂閱，Twitch 上留著舊的就會 409；同步會對照 Twitch 上的清單接回來
  if (status === 409) return "Twitch 上已經有這個訂閱（409），按「同步訂閱」就會接上";
  if (status === 429) return "Twitch 請求太頻繁（429），稍後會自動重試";
  if (status >= 500) return `Twitch 暫時無法使用（${status}），稍後會自動重試`;
  return `Twitch 回應錯誤（${status}）`;
}
