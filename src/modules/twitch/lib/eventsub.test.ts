import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEventSubRequest, verifySignature } from "./eventsub";

const SECRET = "test-secret-1234567890";
const NOW = new Date("2026-10-07T12:00:00Z");

// 依 Twitch 文件：sha256= + hex(HMAC-SHA256(secret, messageId + timestamp + body))
function sign(messageId: string, timestamp: string, body: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(messageId + timestamp + body).digest("hex");
}

function request(type: string, body: object, overrides: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const id = "msg-1";
  const timestamp = "2026-10-07T11:59:00.123456789Z";
  const headers = new Headers({
    "Twitch-Eventsub-Message-Id": id,
    "Twitch-Eventsub-Message-Timestamp": timestamp,
    "Twitch-Eventsub-Message-Signature": sign(id, timestamp, raw),
    "Twitch-Eventsub-Message-Type": type,
    ...overrides,
  });
  return { headers, raw };
}

const subscription = { id: "sub-1", type: "stream.online", status: "enabled" };

describe("verifySignature", () => {
  it("正確簽章_回傳true", () => {
    expect(verifySignature("id", "ts", "body", sign("id", "ts", "body"), SECRET)).toBe(true);
  });

  it("body被竄改_回傳false", () => {
    expect(verifySignature("id", "ts", "body2", sign("id", "ts", "body"), SECRET)).toBe(false);
  });

  it("用不同secret簽_回傳false", () => {
    expect(verifySignature("id", "ts", "body", sign("id", "ts", "body", "other-secret-123"), SECRET)).toBe(false);
  });

  it("缺少sha256前綴_回傳false", () => {
    const bare = sign("id", "ts", "body").replace("sha256=", "");
    expect(verifySignature("id", "ts", "body", bare, SECRET)).toBe(false);
  });
});

describe("parseEventSubRequest", () => {
  it("驗證請求_回傳challenge", () => {
    const { headers, raw } = request("webhook_callback_verification", { challenge: "abc123", subscription });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toEqual({ kind: "verification", challenge: "abc123" });
  });

  it("開台通知_回傳事件內容", () => {
    const event = { broadcaster_user_id: "42", broadcaster_user_login: "foo", broadcaster_user_name: "Foo", type: "live", started_at: "2026-10-07T11:58:00Z" };
    const { headers, raw } = request("notification", { subscription, event });

    const result = parseEventSubRequest(headers, raw, SECRET, NOW);

    expect(result).toEqual({ kind: "notification", messageId: "msg-1", subscription, event });
  });

  it("撤銷通知_回傳訂閱資訊", () => {
    const revoked = { ...subscription, status: "authorization_revoked" };
    const { headers, raw } = request("revocation", { subscription: revoked });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toEqual({ kind: "revocation", messageId: "msg-1", subscription: revoked });
  });

  it("簽章錯誤_拒絕", () => {
    const { headers, raw } = request("notification", { subscription, event: {} }, { "Twitch-Eventsub-Message-Signature": "sha256=00" });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toMatchObject({ kind: "rejected" });
  });

  it("時間戳超過10分鐘_拒絕", () => {
    const { headers, raw } = request("notification", { subscription, event: {} });
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect(parseEventSubRequest(headers, raw, SECRET, later)).toMatchObject({ kind: "rejected" });
  });

  it("缺少標頭_拒絕", () => {
    const { headers, raw } = request("notification", { subscription, event: {} });
    headers.delete("Twitch-Eventsub-Message-Id");
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toMatchObject({ kind: "rejected" });
  });

  it("未知訊息類型_回傳unknown", () => {
    const { headers, raw } = request("something_new", { subscription });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toEqual({ kind: "unknown", messageType: "something_new" });
  });

  it("簽章正確但body不是JSON_回傳malformed而不是丟例外", () => {
    const raw = "{not json";
    const timestamp = "2026-10-07T11:59:00Z";
    const headers = new Headers({
      "Twitch-Eventsub-Message-Id": "msg-bad",
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": sign("msg-bad", timestamp, raw),
      "Twitch-Eventsub-Message-Type": "notification",
    });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toEqual({ kind: "malformed", reason: "body 不是有效的 JSON" });
  });

  it("通知缺少subscription或event_回傳malformed", () => {
    const { headers, raw } = request("notification", { subscription });
    expect(parseEventSubRequest(headers, raw, SECRET, NOW)).toMatchObject({ kind: "malformed" });
  });
});
