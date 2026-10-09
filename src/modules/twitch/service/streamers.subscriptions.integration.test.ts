import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubTwitchEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { twitchFollows, twitchStreamers } from "../data/schema";

vi.mock("../lib/api", { spy: true });

stubTwitchEnv({ PUBLIC_BASE_URL: "https://prod.example.com" });

const twitch = mocksOf(await import("../lib/api"), "createSubscription", "deleteSubscription", "listSubscriptions", "getUsersByLogin");
const { TwitchApiError } = await import("../lib/api");
const { TwitchUserError } = await import("./streamers");
const { addStreamer, removeStreamer, syncSubscriptions, syncSubscriptionsFor } = await import("./streamers");

const OWN_CALLBACK = "https://prod.example.com/api/twitch/eventsub";
const sub = (id: string, type: string, callback: string) => ({
  id, type, status: "enabled", condition: { broadcaster_user_id: "42" }, transport: { method: "webhook", callback },
});

const getDb = setupTestDb();
let me: string;
let other: string;

/** 預設只有 me 追蹤 alice */
beforeEach(async () => {
  Object.values(twitch).forEach((fn) => fn.mockReset());
  // 沒設定回應的呼叫也不能連到真的 Twitch
  twitch.listSubscriptions.mockResolvedValue([]);
  twitch.deleteSubscription.mockResolvedValue(undefined);
  twitch.createSubscription.mockImplementation(async (type: string) => sub(`new-${type}`, type, OWN_CALLBACK));
  twitch.getUsersByLogin.mockResolvedValue([{ id: "42", login: "alice", display_name: "Alice", profile_image_url: "https://static-cdn.jtvnw.net/a.png" }]);
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  const [streamer] = await getDb().insert(twitchStreamers).values({
    broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-1", offlineSubscriptionId: "off-1",
  }).returning();
  await getDb().insert(twitchFollows).values({ userId: me, streamerId: streamer.id });
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

    await expect(removeStreamer(me, streamer.id)).resolves.toBeDefined();

    expect(await getDb().select().from(twitchStreamers)).toHaveLength(0);
    expect(twitch.deleteSubscription).toHaveBeenCalledTimes(2);
  });

  it("Twitch 刪除訂閱失敗_回傳提示訊息", async () => {
    twitch.deleteSubscription.mockRejectedValue(new Error("network down"));
    const [streamer] = await getDb().select().from(twitchStreamers);

    const result = await removeStreamer(me, streamer.id);

    expect(result.warning).toContain("Twitch 上的訂閱沒有刪掉");
  });

  it("刪除成功_沒有提示", async () => {
    twitch.deleteSubscription.mockResolvedValue(undefined);
    const [streamer] = await getDb().select().from(twitchStreamers);

    expect((await removeStreamer(me, streamer.id)).warning).toBeUndefined();
  });
});

describe("主播與訂閱共用：沒有人追蹤時才刪", () => {
  it("還有別人追蹤_只刪自己的追蹤，主播與 Twitch 上的訂閱都留著", async () => {
    const [streamer] = await getDb().select().from(twitchStreamers);
    await getDb().insert(twitchFollows).values({ userId: other, streamerId: streamer.id });

    expect(await removeStreamer(me, streamer.id)).toEqual({});

    expect(twitch.deleteSubscription).not.toHaveBeenCalled();
    expect(await getDb().select().from(twitchStreamers)).toHaveLength(1);
    expect((await getDb().select().from(twitchFollows)).map((f) => f.userId)).toEqual([other]);
  });

  it("用自己沒追蹤的主播 id 移除（別人的追蹤）_沒有效果", async () => {
    const [streamer] = await getDb().select().from(twitchStreamers);

    expect(await removeStreamer(other, streamer.id)).toEqual({});

    expect(twitch.deleteSubscription).not.toHaveBeenCalled();
    expect((await getDb().select().from(twitchFollows)).map((f) => f.userId)).toEqual([me]);
  });

  it("第一次有人追蹤_建立主播與訂閱，追蹤記在他名下", async () => {
    await getDb().delete(twitchStreamers);

    expect(await addStreamer(other, "alice")).toMatchObject({ broadcasterId: "42", onlineSubscriptionId: "new-stream.online" });

    expect(twitch.createSubscription).toHaveBeenCalledTimes(2);
    expect((await getDb().select().from(twitchFollows)).map((f) => f.userId)).toEqual([other]);
  });

  it("已經有人追蹤的主播_只加自己的追蹤，沿用正常的訂閱", async () => {
    await addStreamer(other, "alice");

    expect(twitch.createSubscription).not.toHaveBeenCalled();
    expect(await getDb().select().from(twitchStreamers)).toHaveLength(1);
    expect((await getDb().select().from(twitchFollows)).map((f) => f.userId).sort()).toEqual([me, other].sort());
  });

  it("已經有人追蹤、但訂閱是失敗的主播_新的追蹤者加入時再試一次", async () => {
    await getDb().update(twitchStreamers).set({ onlineSubscriptionId: null, offlineSubscriptionId: null, subscriptionStatus: "訂閱失敗：連線逾時，稍後會自動重試" });

    await addStreamer(other, "alice");

    expect(twitch.createSubscription).toHaveBeenCalledTimes(2);
  });

  it("自己已經追蹤_提示已經在追蹤", async () => {
    await expect(addStreamer(me, "alice")).rejects.toThrow("已經在追蹤「Alice」了");
  });

  it("同步訂閱時刪掉沒有人追蹤的主播（例如最後一位追蹤者刪除了帳號）與它在 Twitch 上的訂閱", async () => {
    await getDb().delete(twitchFollows);
    twitch.listSubscriptions.mockResolvedValue([sub("on-1", "stream.online", OWN_CALLBACK), sub("off-1", "stream.offline", OWN_CALLBACK)]);

    const summary = await syncSubscriptions();

    expect(await getDb().select().from(twitchStreamers)).toHaveLength(0);
    expect(twitch.deleteSubscription.mock.calls.map(([id]) => id).sort()).toEqual(["off-1", "on-1"]);
    expect(twitch.createSubscription).not.toHaveBeenCalled();
    expect(summary).toContain("刪除 1 位沒有人追蹤的主播");
  });
});

describe("syncSubscriptionsFor：使用者按「同步訂閱」", () => {
  const NOW = new Date("2026-10-08T00:00:00Z");
  const later = (ms: number) => new Date(NOW.getTime() + ms);

  beforeEach(async () => {
    // bob 另外追蹤兩位主播，全站共有三位
    const others = await getDb()
      .insert(twitchStreamers)
      .values([
        { broadcasterId: "43", login: "bobby", displayName: "Bobby" },
        { broadcasterId: "44", login: "carol", displayName: "Carol" },
      ])
      .returning();
    await getDb().insert(twitchFollows).values(others.map((streamer) => ({ userId: other, streamerId: streamer.id })));
  });

  it("照樣同步全站共用的訂閱，但回應只說自己追蹤的主播數，不透露全站的主播或訂閱數", async () => {
    twitch.listSubscriptions.mockResolvedValue([sub("x1", "stream.online", OWN_CALLBACK), sub("x2", "stream.offline", OWN_CALLBACK)]);

    const message = await syncSubscriptionsFor(me, NOW);

    expect(message).toBe("已同步你追蹤的 1 位主播，1 位訂閱正常");
    expect(twitch.createSubscription.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("還沒有追蹤主播_說明沒有可以同步的", async () => {
    await getDb().delete(twitchFollows).where(eq(twitchFollows.userId, me));

    expect(await syncSubscriptionsFor(me, NOW)).toBe("已同步。你還沒有追蹤任何主播");
  });

  it("同一個人 60 秒內再按_擋下並說還要等幾秒，不呼叫 Twitch；別人照樣可以按；60 秒後可以再按", async () => {
    await syncSubscriptionsFor(me, NOW);
    twitch.listSubscriptions.mockClear();

    await expect(syncSubscriptionsFor(me, later(20_000))).rejects.toThrow(new TwitchUserError("剛剛才同步過，請 40 秒後再試"));
    expect(twitch.listSubscriptions).not.toHaveBeenCalled();

    await expect(syncSubscriptionsFor(other, later(20_000))).resolves.toContain("你追蹤的 2 位主播");
    await expect(syncSubscriptionsFor(me, later(60_000))).resolves.toContain("你追蹤的 1 位主播");
  });
});
