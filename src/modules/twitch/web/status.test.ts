import { describe, expect, it } from "vitest";
import { describeSubscriptionStatus, subscriptionBadge } from "./status";

describe("describeSubscriptionStatus", () => {
  it.each([
    [null, "未訂閱"],
    ["enabled", "正常"],
    ["webhook_callback_verification_pending", "等待 Twitch 驗證"],
    ["enabled；webhook_callback_verification_pending", "正常；等待 Twitch 驗證"],
    ["訂閱已被撤銷：authorization_revoked", "訂閱已被撤銷：授權被撤銷"],
    ["訂閱失敗：callback must use https", "訂閱失敗：callback must use https"],
  ])("%j → %j", (raw, expected) => {
    expect(describeSubscriptionStatus(raw)).toBe(expected);
  });
});

describe("subscriptionBadge：訂閱狀態改成標籤（不用灰色小字）", () => {
  const healthy = { onlineSubscriptionId: "a", offlineSubscriptionId: "b" };

  it.each([
    [{ ...healthy, subscriptionStatus: "enabled" }, { label: "訂閱正常", tone: "success", detail: null }],
    [{ ...healthy, subscriptionStatus: "webhook_callback_verification_pending" }, { label: "等待 Twitch 驗證", tone: "warning", detail: null }],
    [{ ...healthy, subscriptionStatus: "enabled；webhook_callback_verification_pending" }, { label: "等待 Twitch 驗證", tone: "warning", detail: null }],
    [
      { onlineSubscriptionId: null, offlineSubscriptionId: null, subscriptionStatus: "訂閱失敗：Twitch 拒絕這個請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址" },
      { label: "訂閱失敗", tone: "danger", detail: "Twitch 拒絕這個請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址" },
    ],
    [{ onlineSubscriptionId: null, offlineSubscriptionId: "b", subscriptionStatus: "訂閱已被撤銷：authorization_revoked" }, { label: "訂閱異常", tone: "danger", detail: "訂閱已被撤銷：授權被撤銷" }],
    [{ onlineSubscriptionId: null, offlineSubscriptionId: null, subscriptionStatus: null }, { label: "未訂閱", tone: "danger", detail: null }],
  ])("%j", (streamer, expected) => {
    expect(subscriptionBadge(streamer)).toEqual(expected);
  });
});
