import type { StatusBadge } from "@/core/ui/status-chip";
import { subscriptionsHealthy } from "../lib/subscriptions";

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

const FAILURE_PREFIX = "訂閱失敗：";

/** 主播的訂閱狀態標籤；收不到通知的情況（失敗、撤銷）一律是紅色，原因放在 detail */
export function subscriptionBadge(streamer: Parameters<typeof subscriptionsHealthy>[0]): StatusBadge {
  const raw = streamer.subscriptionStatus;
  if (!subscriptionsHealthy(streamer)) {
    if (!raw) return { label: "未訂閱", tone: "danger", detail: null };
    if (raw.startsWith(FAILURE_PREFIX)) return { label: "訂閱失敗", tone: "danger", detail: describeSubscriptionStatus(raw.slice(FAILURE_PREFIX.length)) };
    return { label: "訂閱異常", tone: "danger", detail: describeSubscriptionStatus(raw) };
  }
  const codes = raw?.split("；") ?? [];
  if (codes.length > 0 && codes.every((code) => code === "enabled")) return { label: "訂閱正常", tone: "success", detail: null };
  if (codes.includes("webhook_callback_verification_pending")) return { label: "等待 Twitch 驗證", tone: "warning", detail: null };
  return { label: "訂閱異常", tone: "warning", detail: describeSubscriptionStatus(raw) };
}

/** 資料庫存的是 Twitch 原始代碼（可能多個以「；」串接，或包在中文訊息裡），只替換認得的代碼 */
export function describeSubscriptionStatus(raw: string | null): string {
  if (!raw) return "未訂閱";
  return raw.replace(/[a-z_]+/g, (code) => LABELS[code] ?? code);
}
