import { cacheLife, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { expiredTags, mocksOf, tagged } from "@/dev/test-helpers";
import { twitchStreamEvents, twitchStreamers } from "../data/schema";

vi.mock("../lib/api", { spy: true });

const { getStreams } = mocksOf(await import("../lib/api"), "getStreams");
const { cachedRecentEvents, cachedStreamers } = await import("./cached");
const { handleNotification, handleRevocation } = await import("./streamers");

const onlineSub = { id: "sub-on", type: "stream.online", status: "enabled", condition: { broadcaster_user_id: "42" } };
const offlineSub = { ...onlineSub, id: "sub-off", type: "stream.offline" };
const event = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-07T09:00:00Z" };

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

beforeEach(async () => {
  getStreams.mockReset().mockResolvedValue([{ user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" }]);
  await testDb.insert(twitchStreamers).values({ broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "sub-on", offlineSubscriptionId: "sub-off" });
});

describe("Twitch 的快取讀取", () => {
  it("cachedStreamers_標上 twitch:streamers、用 db 效期", async () => {
    expect((await cachedStreamers()).map((s) => s.login)).toEqual(["alice"]);
    expect(tagged()).toEqual(["twitch:streamers"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecentEvents_讀了紀錄與主播名稱兩張表_兩個 tag 都標", async () => {
    await testDb.insert(twitchStreamEvents).values({ messageId: "m0", broadcasterId: "42", type: "online" });

    expect((await cachedRecentEvents()).map((e) => e.displayName)).toEqual(["Alice"]);
    expect(tagged()).toEqual(["twitch:events", "twitch:streamers"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });
});

describe("EventSub webhook：寫入後讓 tag 失效（expire: 0）", () => {
  it("開台_先失效紀錄與直播中狀態_延後的直播資訊與通知再失效一次", async () => {
    let deferred: (() => Promise<void>) | undefined;

    await handleNotification("m1", onlineSub as never, event as never, { defer: (task) => (deferred = task) });

    expect(expiredTags()).toEqual(["twitch:events", "twitch:streamers"]);
    vi.mocked(revalidateTag).mockReset();

    await deferred!();

    expect((await testDb.select().from(twitchStreamEvents))[0].title).toBe("今天玩鐵道");
    expect(expiredTags()).toEqual(["core:notifications", "twitch:events"]);
  });

  it("關台_紀錄與直播中狀態失效", async () => {
    await handleNotification("m2", offlineSub as never, event as never);

    expect(expiredTags()).toEqual(["twitch:events", "twitch:streamers"]);
  });

  it("Twitch 重送同一則通知_沒有寫入就不失效", async () => {
    await handleNotification("m1", offlineSub as never, event as never);
    vi.mocked(revalidateTag).mockReset();

    await handleNotification("m1", offlineSub as never, event as never);

    expect(expiredTags()).toEqual([]);
  });

  it("沒有追蹤的主播_不寫入也不失效", async () => {
    await handleNotification("m3", offlineSub as never, { ...event, broadcaster_user_id: "999" } as never);

    expect(expiredTags()).toEqual([]);
  });

  it("訂閱被撤銷_主播的訂閱狀態失效", async () => {
    await handleRevocation({ id: "sub-on", type: "stream.online", status: "authorization_revoked" });

    expect((await testDb.select().from(twitchStreamers))[0].onlineSubscriptionId).toBeNull();
    expect(expiredTags()).toEqual(["twitch:streamers"]);
  });

  it("撤銷的是不認得的訂閱_沒有寫入就不失效", async () => {
    await handleRevocation({ id: "sub-unknown", type: "stream.online", status: "authorization_revoked" });

    expect(expiredTags()).toEqual([]);
  });
});
