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

/** 資料庫存的是 Twitch 原始代碼（可能多個以「；」串接，或包在中文訊息裡），只替換認得的代碼 */
export function describeSubscriptionStatus(raw: string | null): string {
  if (!raw) return "未訂閱";
  return raw.replace(/[a-z_]+/g, (code) => LABELS[code] ?? code);
}
