import type { StatusBadge } from "@/core/ui/status-chip";
import { SUBSCRIPTION_FAILED, subscriptionsHealthy } from "../lib/subscriptions";

const LABELS: Record<string, string> = {
  enabled: "正常",
  webhook_callback_verification_pending: "等待 Twitch 驗證",
  webhook_callback_verification_failed: "Twitch 驗證失敗（網址連不到或不是 HTTPS）",
  notification_failures_exceeded: "通知失敗次數過多",
  authorization_revoked: "授權被撤銷",
  moderator_removed: "管理員權限被移除",
  user_removed: "主播帳號已不存在",
  version_removed: "訂閱版本已停用",
};

/** 主播的訂閱狀態標籤 失敗或撤銷這類收不到通知的一律紅色 原因放在 detail */
export function subscriptionBadge(streamer: Parameters<typeof subscriptionsHealthy>[0]): StatusBadge {
  const raw = streamer.subscriptionStatus;
  if (!subscriptionsHealthy(streamer)) {
    if (!raw) return { label: "未訂閱", tone: "danger", detail: null };
    if (raw.startsWith(SUBSCRIPTION_FAILED)) return { label: "訂閱失敗", tone: "danger", detail: describeSubscriptionStatus(raw.slice(SUBSCRIPTION_FAILED.length)) };
    return { label: "訂閱異常", tone: "danger", detail: describeSubscriptionStatus(raw) };
  }
  const codes = raw?.split("；") ?? [];
  if (codes.length > 0 && codes.every((code) => code === "enabled")) return { label: "訂閱正常", tone: "success", detail: null };
  if (codes.includes("webhook_callback_verification_pending")) return { label: "等待 Twitch 驗證", tone: "warning", detail: null };
  return { label: "訂閱異常", tone: "warning", detail: describeSubscriptionStatus(raw) };
}

/** 資料庫存的是 Twitch 的原始代碼 可能好幾個串在一起或包在中文訊息裡 只換認得的 */
function describeSubscriptionStatus(raw: string | null): string {
  if (!raw) return "未訂閱";
  return raw.replace(/[a-z_]+/g, (code) => LABELS[code] ?? code);
}
