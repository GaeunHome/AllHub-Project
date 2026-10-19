import type { TestDb } from "@/dev/test-db";
import type { TwitchStream } from "../lib/api";
import type { EventSubSubscription, StreamEvent } from "../lib/eventsub";
import type { LiveStream } from "../lib/visuals";
import { twitchFollows, twitchStreamers, type FollowedStreamer, type TwitchStreamer } from "../data/schema";

// Twitch 的測試共用的假資料 只有測試可以 import

/** 追蹤中的主播 broadcasterId 是 1000 加 id 名稱是帳號的大寫 預設離線 訂閱正常 通知開著 */
export const followedStreamer = (id: number, login: string, overrides: Partial<FollowedStreamer> = {}): FollowedStreamer => ({
  id,
  broadcasterId: String(1000 + id),
  login,
  displayName: login.toUpperCase(),
  profileImageUrl: null,
  onlineSubscriptionId: "sub-on",
  offlineSubscriptionId: "sub-off",
  subscriptionStatus: "enabled",
  isLive: false,
  notifyEnabled: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...overrides,
});

/** Helix 查得到的直播 對應 followedStreamer 的同一個 id 開台 95 分鐘 */
export const liveStream = (id: number, login: string, overrides: Partial<LiveStream> = {}): LiveStream => ({
  userId: String(1000 + id),
  title: "今天玩鐵道",
  gameId: "1351906",
  gameName: "Honkai: Star Rail",
  viewerCount: 1234,
  startedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
  previewUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg`,
  largePreviewUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1920x1080.jpg`,
  ...overrides,
});

// 以下是整合測試用的 主播都是 broadcaster 42 的 alice

/** EventSub 的開台訂閱 */
export const ONLINE_SUBSCRIPTION: EventSubSubscription = { id: "sub-on", type: "stream.online", status: "enabled", condition: { broadcaster_user_id: "42" } };

/** EventSub 送來的開台或關台事件 開台才有 started_at */
export const ALICE_EVENT: StreamEvent = { broadcaster_user_id: "42", broadcaster_user_login: "alice", broadcaster_user_name: "Alice", started_at: "2026-10-07T09:00:00Z" };

/** 開台後 Helix /streams 查到的直播資訊 */
export const ALICE_STREAM: TwitchStream = { user_id: "42", title: "今天玩鐵道", game_name: "Honkai: Star Rail", started_at: "" };

/** 寫進主播 alice 並讓 userId 追蹤 回傳主播那一列 */
export async function seedFollowedStreamer(db: TestDb, userId: string, values: Partial<typeof twitchStreamers.$inferInsert> = {}): Promise<TwitchStreamer> {
  const [streamer] = await db
    .insert(twitchStreamers)
    .values({ broadcasterId: "42", login: "alice", displayName: "Alice", ...values })
    .returning();
  await db.insert(twitchFollows).values({ userId, streamerId: streamer.id });
  return streamer;
}
