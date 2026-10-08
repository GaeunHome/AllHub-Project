import { describe, expect, it } from "vitest";
import { TwitchApiError } from "./api";
import { subscriptionFailure, subscriptionsHealthy } from "./subscriptions";

const healthy = { onlineSubscriptionId: "on-1", offlineSubscriptionId: "off-1", subscriptionStatus: "enabled" };

describe("subscriptionsHealthy", () => {
  it("兩個訂閱都在、狀態沒有失敗_正常", () => {
    expect(subscriptionsHealthy(healthy)).toBe(true);
    expect(subscriptionsHealthy({ ...healthy, subscriptionStatus: "webhook_callback_verification_pending" })).toBe(true);
  });

  it.each([
    ["少了開台訂閱", { ...healthy, onlineSubscriptionId: null }],
    ["少了關台訂閱", { ...healthy, offlineSubscriptionId: null }],
    ["狀態是失敗", { ...healthy, subscriptionStatus: "訂閱失敗：callback must use https" }],
  ])("%s_不正常", (_name, streamer) => {
    expect(subscriptionsHealthy(streamer)).toBe(false);
  });
});

describe("subscriptionFailure：訂閱失敗寫進狀態的中文摘要（畫面會顯示，不放錯誤原文）", () => {
  const twitchError = (status: number) => new TwitchApiError(status, `POST /eventsub/subscriptions失敗（${status}）：secret-detail`);

  it.each([
    ["逾時", new DOMException("The operation was aborted due to timeout", "TimeoutError"), "訂閱失敗：連線逾時，稍後會自動重試"],
    ["連不上 Twitch", new TypeError("fetch failed secret-detail"), "訂閱失敗：連不上 Twitch，稍後會自動重試"],
    ["Twitch 回 400", twitchError(400), "訂閱失敗：Twitch 拒絕這個請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址"],
    ["Twitch 回 401", twitchError(401), "訂閱失敗：Twitch 拒絕授權（401），請確認 TWITCH_CLIENT_ID 與 TWITCH_CLIENT_SECRET"],
    ["Twitch 回 403", twitchError(403), "訂閱失敗：Twitch 拒絕授權（403），請確認 TWITCH_CLIENT_ID 與 TWITCH_CLIENT_SECRET"],
    ["Twitch 上已經有同樣的訂閱", twitchError(409), "訂閱失敗：Twitch 上已經有這個訂閱（409），按「同步訂閱」就會接上"],
    ["請求太頻繁", twitchError(429), "訂閱失敗：Twitch 請求太頻繁（429），稍後會自動重試"],
    ["Twitch 暫時故障", twitchError(503), "訂閱失敗：Twitch 暫時無法使用（503），稍後會自動重試"],
    ["其他狀態碼", twitchError(418), "訂閱失敗：Twitch 回應錯誤（418）"],
    ["其他種類的錯誤", Object.assign(new Error("secret-detail"), { name: "DrizzleQueryError" }), "訂閱失敗：發生錯誤（DrizzleQueryError）"],
  ])("%s", (_name, error, expected) => {
    const status = subscriptionFailure(error);

    expect(status).toBe(expected);
    expect(status).not.toContain("secret-detail");
  });

  it("摘要裡都有「失敗」_subscriptionsHealthy 會把它當成不正常、同步時補建", () => {
    expect(subscriptionsHealthy({ ...healthy, subscriptionStatus: subscriptionFailure(twitchError(500)) })).toBe(false);
  });
});
