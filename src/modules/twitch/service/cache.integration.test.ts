import { cacheLife, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { expiredTags, mocksOf, tagged } from "@/dev/test-helpers";
import { twitchStreamEvents, twitchStreamers } from "../data/schema";
import { ALICE_STREAM, ALICE_EVENT, ONLINE_SUBSCRIPTION, seedFollowedStreamer } from "../dev/fixtures";

vi.mock("../lib/api", { spy: true });

const { getStreams } = mocksOf(await import("../lib/api"), "getStreams");
const { cachedRecentEvents, cachedStreamers } = await import("./cached");
const { handleNotification, handleRevocation } = await import("./streamers");

const offlineSub = { ...ONLINE_SUBSCRIPTION, id: "sub-off", type: "stream.offline" };

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;

beforeEach(async () => {
  getStreams.mockReset().mockResolvedValue([ALICE_STREAM]);
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  await seedFollowedStreamer(testDb, me, { onlineSubscriptionId: "sub-on", offlineSubscriptionId: "sub-off" });
});

describe("Twitch 的快取讀取", () => {
  it("cachedStreamers_讀了主播與追蹤兩張表：標上 twitch:follows、twitch:streamers，用 db 效期", async () => {
    expect((await cachedStreamers(me)).map((s) => s.login)).toEqual(["alice"]);
    expect(tagged()).toEqual(["twitch:follows", "twitch:streamers"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecentEvents_讀了紀錄、主播名稱與追蹤三張表_三個 tag 都標", async () => {
    await testDb.insert(twitchStreamEvents).values({ messageId: "m0", broadcasterId: "42", type: "online" });

    expect((await cachedRecentEvents(me)).map((e) => e.displayName)).toEqual(["Alice"]);
    expect(tagged()).toEqual(["twitch:events", "twitch:follows", "twitch:streamers"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });
});

describe("EventSub webhook：寫入後讓 tag 失效（expire: 0）", () => {
  it("開台_先失效紀錄與直播中狀態_延後的直播資訊與通知再失效一次", async () => {
    let deferred: (() => Promise<void>) | undefined;

    await handleNotification("m1", ONLINE_SUBSCRIPTION, ALICE_EVENT, { defer: (task) => (deferred = task) });

    expect(expiredTags()).toEqual(["twitch:events", "twitch:streamers"]);
    vi.mocked(revalidateTag).mockReset();

    await deferred!();

    expect((await testDb.select().from(twitchStreamEvents))[0].title).toBe("今天玩鐵道");
    expect(expiredTags()).toEqual(["core:notifications", "twitch:events"]);
  });

  it("關台_紀錄與直播中狀態失效", async () => {
    await handleNotification("m2", offlineSub, ALICE_EVENT);

    expect(expiredTags()).toEqual(["twitch:events", "twitch:streamers"]);
  });

  it("Twitch 重送同一則通知_沒有寫入就不失效", async () => {
    await handleNotification("m1", offlineSub, ALICE_EVENT);
    vi.mocked(revalidateTag).mockReset();

    await handleNotification("m1", offlineSub, ALICE_EVENT);

    expect(expiredTags()).toEqual([]);
  });

  it("沒有追蹤的主播_不寫入也不失效", async () => {
    await handleNotification("m3", offlineSub, { ...ALICE_EVENT, broadcaster_user_id: "999" });

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
