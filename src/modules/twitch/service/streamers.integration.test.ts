import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { twitchStreamEvents, twitchStreamers } from "../data/schema";

vi.mock("../lib/api", { spy: true });
vi.mock("@/core/notify", { spy: true });

const { getStreams } = mocksOf(await import("../lib/api"), "getStreams");
const { TwitchApiError } = await import("../lib/api");
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { cleanupStreamEvents, handleNotification, listStreamers, setStreamerNotify } = await import("./streamers");

const onlineSub = { id: "sub-on", type: "stream.online", version: "1", status: "enabled", condition: { broadcaster_user_id: "42" } };
const onlineEvent = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-07T09:00:00Z" };

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));

beforeEach(async () => {
  getStreams.mockReset().mockResolvedValue([{ user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" }]);
  notify.mockReset().mockResolvedValue(undefined);
  await getDb().insert(twitchStreamers).values({ broadcasterId: "42", login: "alice", displayName: "Alice" });
});

describe("handleNotification（PGlite 整合）", () => {
  it("開台_寫入事件含標題分類_標記直播中_發通知", async () => {
    await handleNotification("m1", onlineSub as never, onlineEvent as never);

    const [event] = await testDb.select().from(twitchStreamEvents);
    expect(event).toMatchObject({ messageId: "m1", type: "online", title: "今天玩鐵道", category: "Honkai: Star Rail" });
    const [streamer] = await testDb.select().from(twitchStreamers);
    expect(streamer.isLive).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("開台通知寫進網站通知：模組 twitch、直播標題與分類、連到 Twitch 頻道", async () => {
    await handleNotification("m1", onlineSub as never, onlineEvent as never);

    expect(notify).toHaveBeenCalledWith({
      module: "twitch",
      kind: "stream_online",
      title: "Alice 開台了",
      body: "今天玩鐵道\n分類：Honkai: Star Rail",
      url: "https://twitch.tv/alice",
    });
  });

  it("關掉通知的主播_照樣記錄開台、直播中狀態與直播資訊_但不建立通知", async () => {
    await testDb.update(twitchStreamers).set({ notifyEnabled: false });

    await handleNotification("m1", onlineSub as never, onlineEvent as never);

    const [event] = await testDb.select().from(twitchStreamEvents);
    expect(event).toMatchObject({ messageId: "m1", type: "online", title: "今天玩鐵道", category: "Honkai: Star Rail" });
    const [streamer] = await testDb.select().from(twitchStreamers);
    expect(streamer.isLive).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("同一則通知重送_只處理一次_也不重查直播資訊", async () => {
    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    await handleNotification("m1", onlineSub as never, onlineEvent as never);

    expect(await testDb.select().from(twitchStreamEvents)).toHaveLength(1);
    expect(notify).toHaveBeenCalledOnce();
    expect(getStreams).toHaveBeenCalledOnce();
  });

  it("沒有追蹤的主播_不寫紀錄也不通知", async () => {
    const stranger = { ...onlineEvent, broadcaster_user_id: "999", broadcaster_user_name: "Stranger" };
    await handleNotification("m2", { ...onlineSub, condition: { broadcaster_user_id: "999" } } as never, stranger as never);

    expect(await testDb.select().from(twitchStreamEvents)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(getStreams).not.toHaveBeenCalled();
  });

  it("查直播資訊失敗_仍寫入事件並通知", async () => {
    getStreams.mockRejectedValue(new Error("boom"));
    await handleNotification("m3", onlineSub as never, onlineEvent as never);

    const [event] = await testDb.select().from(twitchStreamEvents);
    expect(event).toMatchObject({ messageId: "m3", title: null });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("關台_取消直播中且不通知", async () => {
    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    notify.mockClear();
    await handleNotification("m4", { ...onlineSub, type: "stream.offline" } as never, onlineEvent as never);

    const [streamer] = await testDb.select().from(twitchStreamers);
    expect(streamer.isLive).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("開台時直播資訊還查不到_等一下重試_查到後補上標題", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    getStreams
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ user_id: "42", title: "晚來的標題", game_name: "Just Chatting", started_at: "" }]);

    await handleNotification("m5", onlineSub as never, onlineEvent as never, { sleep });

    expect(getStreams).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    const [event] = await testDb.select().from(twitchStreamEvents);
    expect(event.title).toBe("晚來的標題");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("重試兩次仍查不到_照樣通知_不再多查", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    getStreams.mockReset().mockResolvedValue([]);

    await handleNotification("m6", onlineSub as never, onlineEvent as never, { sleep });

    expect(getStreams).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("defer_紀錄與直播中狀態先寫好_查詢與通知延後執行", async () => {
    let deferred: (() => Promise<void>) | undefined;
    const defer = vi.fn((task: () => Promise<void>) => {
      deferred = task;
    });

    await handleNotification("m7", onlineSub as never, onlineEvent as never, { defer });

    expect(await testDb.select().from(twitchStreamEvents)).toHaveLength(1);
    const [streamer] = await testDb.select().from(twitchStreamers);
    expect(streamer.isLive).toBe(true);
    expect(getStreams).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await deferred!();
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("開台後補資訊與通知失敗時，log 只記錯誤種類（message 可能夾帶 SQL 參數或 Twitch 回應原文）", () => {
  it("建立通知失敗（例如資料庫錯誤）_log 記錯誤種類_不帶 message", async () => {
    const log = captureErrorLog();
    notify.mockRejectedValue(Object.assign(new Error('Failed query: insert into "core_notifications" params: secret-detail'), { name: "DrizzleQueryError" }));

    await handleNotification("m8", onlineSub as never, onlineEvent as never);

    expect(loggedText(log)).toContain("DrizzleQueryError");
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("查直播資訊時 Twitch 回錯誤_log 記狀態碼_不帶 Twitch 回應的原文", async () => {
    const log = captureErrorLog();
    getStreams.mockRejectedValue(new TwitchApiError(500, "GET /streams失敗（500）：secret-detail"));

    await handleNotification("m9", onlineSub as never, onlineEvent as never);

    expect(loggedText(log)).toContain("500");
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("查直播資訊時連線失敗_log 記錯誤種類_不帶 message", async () => {
    const log = captureErrorLog();
    getStreams.mockRejectedValue(new TypeError("fetch failed: secret-detail"));

    await handleNotification("m10", onlineSub as never, onlineEvent as never);

    expect(loggedText(log)).toContain("TypeError");
    expect(loggedText(log)).not.toContain("secret-detail");
  });
});

describe("cleanupStreamEvents（PGlite 整合）", () => {
  const NOW = new Date("2026-10-21T12:00:00Z");
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000);

  it("只刪超過 14 天的開台／關台紀錄_主播不動", async () => {
    await testDb.insert(twitchStreamEvents).values([
      { messageId: "old", broadcasterId: "42", type: "online", receivedAt: daysAgo(15) },
      { messageId: "edge", broadcasterId: "42", type: "offline", receivedAt: daysAgo(14) },
      { messageId: "new", broadcasterId: "42", type: "online", receivedAt: daysAgo(1) },
    ]);

    expect(await cleanupStreamEvents(NOW)).toBe("刪除 1 筆超過 14 天的開台／關台紀錄");

    const left = await testDb.select({ messageId: twitchStreamEvents.messageId }).from(twitchStreamEvents);
    expect(left.map((e) => e.messageId).sort()).toEqual(["edge", "new"]);
    expect(await testDb.select().from(twitchStreamers)).toHaveLength(1);
  });

  it("沒有過期紀錄_刪除 0 筆", async () => {
    await testDb.insert(twitchStreamEvents).values({ messageId: "new", broadcasterId: "42", type: "online", receivedAt: daysAgo(1) });

    expect(await cleanupStreamEvents(NOW)).toBe("刪除 0 筆超過 14 天的開台／關台紀錄");
    expect(await testDb.select().from(twitchStreamEvents)).toHaveLength(1);
  });
});

describe("通知開關（PGlite 整合）", () => {
  it("新追蹤的主播預設開啟通知", async () => {
    expect((await listStreamers()).map((s) => s.notifyEnabled)).toEqual([true]);
  });

  it("setStreamerNotify_開關各自記在主播上_找不到主播回 false", async () => {
    const [streamer] = await listStreamers();

    expect(await setStreamerNotify(streamer.id, false)).toBe(true);
    expect((await listStreamers())[0].notifyEnabled).toBe(false);
    expect(await setStreamerNotify(streamer.id, true)).toBe(true);
    expect((await listStreamers())[0].notifyEnabled).toBe(true);
    expect(await setStreamerNotify(9999, false)).toBe(false);
  });

  it("關掉後再開台_不建立通知；重新打開後_下一次開台又會通知", async () => {
    const [streamer] = await listStreamers();
    await setStreamerNotify(streamer.id, false);
    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    expect(notify).not.toHaveBeenCalled();

    await setStreamerNotify(streamer.id, true);
    await handleNotification("m2", onlineSub as never, onlineEvent as never);
    expect(notify).toHaveBeenCalledOnce();
  });
});
