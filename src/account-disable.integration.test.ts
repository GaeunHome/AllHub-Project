import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv, stubTwitchEnv, stubYoutubeEnv } from "@/dev/test-env";
import { mocksOf } from "@/dev/test-helpers";
import { twitchFollows, twitchStreamers } from "@/modules/twitch/data/schema";
import { youtubeChannels, youtubeFollows } from "@/modules/youtube/data/schema";

// 停用＝凍結：notify()（core）不寫通知給停用的人，各模組的追蹤與訂閱照樣保留；core 不能 import 模組，所以這個跨模組的檢查放在 src 底下

stubCoreEnv();
stubTwitchEnv();
stubYoutubeEnv();

vi.mock("@/modules/twitch/lib/api", { spy: true });
vi.mock("@/modules/youtube/lib/api", { spy: true });
vi.mock("@/modules/youtube/lib/subtitles/captions", { spy: true });

const twitchApi = mocksOf(await import("@/modules/twitch/lib/api"), "getStreams", "listSubscriptions", "createSubscription", "deleteSubscription");
const youtubeApi = mocksOf(await import("@/modules/youtube/lib/api"), "hubRequest");
const { listCaptionTracks } = mocksOf(await import("@/modules/youtube/lib/subtitles/captions"), "listCaptionTracks");
const { handleNotification, syncSubscriptions } = await import("@/modules/twitch/service/streamers");
const { handleFeed, renewSubscriptions } = await import("@/modules/youtube/service/channels");
const { setUserDisabled } = await import("@/core/admin/service");

const getDb = setupTestDb();
const SHARED_CH = "UC" + "a".repeat(22);
const MEMBER_ONLY_CH = "UC" + "b".repeat(22);
const onlineSub = { id: "sub-on", type: "stream.online", version: "1", status: "enabled", condition: { broadcaster_user_id: "42" } };
const onlineEvent = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-08T09:00:00Z" };

let owner: string;
let member: string;

const notificationsOf = async (userId: string) => (await getDb().select().from(coreNotifications).where(eq(coreNotifications.userId, userId))).map((n) => n.module);

beforeEach(async () => {
  owner = await insertTestUser(getDb(), "boss", { role: "owner" });
  member = await insertTestUser(getDb(), "member");
  twitchApi.getStreams.mockReset().mockResolvedValue([{ user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" }]);
  twitchApi.listSubscriptions.mockReset().mockResolvedValue([]);
  twitchApi.createSubscription.mockReset().mockImplementation(async (type: string, broadcasterId: string) => ({ id: `${type}-${broadcasterId}`, type, status: "enabled" }));
  twitchApi.deleteSubscription.mockReset().mockResolvedValue(undefined);
  youtubeApi.hubRequest.mockReset().mockResolvedValue(undefined);
  listCaptionTracks.mockReset().mockResolvedValue({ ok: true, tracks: [] });

  const [shared, memberOnly] = await getDb()
    .insert(twitchStreamers)
    .values([
      { broadcasterId: "42", login: "alice", displayName: "Alice", onlineSubscriptionId: "on-42", offlineSubscriptionId: "off-42", subscriptionStatus: "enabled" },
      { broadcasterId: "43", login: "bobby", displayName: "Bobby", onlineSubscriptionId: "on-43", offlineSubscriptionId: "off-43", subscriptionStatus: "enabled" },
    ])
    .returning();
  await getDb().insert(twitchFollows).values([
    { userId: owner, streamerId: shared.id },
    { userId: member, streamerId: shared.id },
    { userId: member, streamerId: memberOnly.id },
  ]);
  await getDb().insert(youtubeChannels).values([
    { channelId: SHARED_CH, title: "뉴진스", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) },
    { channelId: MEMBER_ONLY_CH, title: "別的頻道", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(Date.now() + 4 * 86_400_000) },
  ]);
  await getDb().insert(youtubeFollows).values([
    { userId: owner, channelId: SHARED_CH },
    { userId: member, channelId: SHARED_CH },
    { userId: member, channelId: MEMBER_ONLY_CH },
  ]);
});

describe("停用＝凍結：資料全部保留，只是排程與通知不處理他", () => {
  it("停用的人追蹤的主播開台、頻道發新影片都不寫通知給他，其他追蹤者照常；恢復後照常收到", async () => {
    await setUserDisabled(owner, member, true);

    await handleNotification("m1", onlineSub as never, onlineEvent as never);
    await handleFeed([{ videoId: "newvideo001", channelId: SHARED_CH, title: "새 영상", published: new Date(), url: "" }]);

    expect(await notificationsOf(member)).toEqual([]);
    expect((await notificationsOf(owner)).sort()).toEqual(["twitch", "youtube"]);

    await setUserDisabled(owner, member, false);
    await handleNotification("m2", onlineSub as never, onlineEvent as never);

    expect(await notificationsOf(member)).toEqual(["twitch"]);
  });

  it("追蹤名單與共用的訂閱都保留：只有他追蹤的主播與頻道，同步與續訂排程不會刪掉，恢復後不用重建", async () => {
    await setUserDisabled(owner, member, true);

    await syncSubscriptions();
    await renewSubscriptions();

    expect((await getDb().select().from(twitchStreamers)).map((s) => s.login).sort()).toEqual(["alice", "bobby"]);
    expect((await getDb().select().from(youtubeChannels)).map((c) => c.channelId).sort()).toEqual([SHARED_CH, MEMBER_ONLY_CH]);
    expect(await getDb().select().from(twitchFollows).where(eq(twitchFollows.userId, member))).toHaveLength(2);
    expect(await getDb().select().from(youtubeFollows).where(eq(youtubeFollows.userId, member))).toHaveLength(2);
    expect(twitchApi.deleteSubscription).not.toHaveBeenCalled();
    expect(youtubeApi.hubRequest.mock.calls.filter(([mode]) => mode === "unsubscribe")).toEqual([]);
  });
});
