import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubTwitchEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { twitchStreamers } from "../data/schema";

vi.mock("../lib/api", { spy: true });

stubTwitchEnv({ PUBLIC_BASE_URL: "https://prod.example.com" });

const twitch = mocksOf(await import("../lib/api"), "createSubscription", "deleteSubscription", "listSubscriptions");
const { TwitchApiError } = await import("../lib/api");
const { removeStreamer, syncSubscriptions } = await import("./streamers");

const OWN_CALLBACK = "https://prod.example.com/api/twitch/eventsub";
const sub = (id: string, type: string, callback: string) => ({
  id, type, status: "enabled", condition: { broadcaster_user_id: "42" }, transport: { method: "webhook", callback },
});

const getDb = setupTestDb();

beforeEach(async () => {
  Object.values(twitch).forEach((fn) => fn.mockReset());
  // 沒設定回應的呼叫也不能連到真的 Twitch
  twitch.listSubscriptions.mockResolvedValue([]);
  twitch.deleteSubscription.mockResolvedValue(undefined);
  twitch.createSubscription.mockImplementation(async (type: string) => sub(`new-${type}`, type, OWN_CALLBACK));
  await getDb().insert(twitchStreamers).values({
    broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-1", offlineSubscriptionId: "off-1",
  });
});

describe("syncSubscriptions（PGlite 整合）", () => {
  it("同一個 Twitch 應用程式在別的環境建的訂閱_不當成自己的_另外建立", async () => {
    twitch.listSubscriptions.mockResolvedValue([
      sub("other-on", "stream.online", "https://dev.ngrok.app/api/twitch/eventsub"),
      sub("other-off", "stream.offline", "https://dev.ngrok.app/api/twitch/eventsub"),
    ]);

    await syncSubscriptions();

    expect(twitch.createSubscription).toHaveBeenCalledTimes(2);
    expect(twitch.deleteSubscription).not.toHaveBeenCalled();
    const [streamer] = await getDb().select().from(twitchStreamers);
    expect(streamer.onlineSubscriptionId).toBe("new-stream.online");
  });

  it("自己環境的健康訂閱_沿用不重建", async () => {
    twitch.listSubscriptions.mockResolvedValue([sub("on-1", "stream.online", OWN_CALLBACK), sub("off-1", "stream.offline", OWN_CALLBACK)]);

    await syncSubscriptions();

    expect(twitch.createSubscription).not.toHaveBeenCalled();
  });

  it("建立訂閱逾時_狀態寫「連線逾時，稍後會自動重試」，不寫英文的錯誤原文；log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    twitch.createSubscription.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    await syncSubscriptions();

    const [streamer] = await getDb().select().from(twitchStreamers);
    expect(streamer.subscriptionStatus).toBe("訂閱失敗：連線逾時，稍後會自動重試");
    expect(streamer.onlineSubscriptionId).toBeNull();
    expect(loggedText(log)).toContain("TimeoutError");
    expect(loggedText(log)).not.toContain("aborted");
  });

  it("Twitch 拒絕建立訂閱_狀態依狀態碼寫中文摘要，不顯示 Twitch 回應的原文", async () => {
    captureErrorLog();
    twitch.createSubscription.mockRejectedValue(new TwitchApiError(400, "POST /eventsub/subscriptions失敗（400）：invalid transport callback"));

    await syncSubscriptions();

    const [streamer] = await getDb().select().from(twitchStreamers);
    expect(streamer.subscriptionStatus).toBe("訂閱失敗：Twitch 拒絕這個請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址");
    expect(streamer.subscriptionStatus).not.toContain("invalid transport");
  });
});

describe("removeStreamer（PGlite 整合）", () => {
  it("Twitch 刪除訂閱失敗_仍刪除主播_不丟例外", async () => {
    twitch.deleteSubscription.mockRejectedValue(new TwitchApiError(500, "DELETE /eventsub/subscriptions失敗（500）：boom"));
    const [streamer] = await getDb().select().from(twitchStreamers);

    await expect(removeStreamer(streamer.id)).resolves.toBeDefined();

    expect(await getDb().select().from(twitchStreamers)).toHaveLength(0);
    expect(twitch.deleteSubscription).toHaveBeenCalledTimes(2);
  });

  it("Twitch 刪除訂閱失敗_回傳提示訊息", async () => {
    twitch.deleteSubscription.mockRejectedValue(new Error("network down"));
    const [streamer] = await getDb().select().from(twitchStreamers);

    const result = await removeStreamer(streamer.id);

    expect(result.warning).toContain("Twitch 上的訂閱沒有刪掉");
  });

  it("刪除成功_沒有提示", async () => {
    twitch.deleteSubscription.mockResolvedValue(undefined);
    const [streamer] = await getDb().select().from(twitchStreamers);

    expect((await removeStreamer(streamer.id)).warning).toBeUndefined();
  });
});
