import { describe, expect, it } from "vitest";
import { describeSubscriptionStatus } from "./status";

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
