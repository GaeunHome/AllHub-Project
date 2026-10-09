import "server-only";
import { and, count, desc, eq, getTableColumns, lt, or } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { takeCooldown } from "@/core/cooldown";
import { db } from "@/core/db";
import { missingTwitchEnv } from "@/core/env";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { RETENTION_DAYS, retentionCutoff } from "@/core/retention";
import {
  TwitchApiError,
  createSubscription,
  deleteSubscription,
  eventSubCallbackUrl,
  getStreams,
  getUsersByLogin,
  listSubscriptions,
  type StreamEventType,
} from "../lib/api";
import type { EventSubSubscription, StreamEvent } from "../lib/eventsub";
import { subscriptionFailure, subscriptionsHealthy } from "../lib/subscriptions";
import { twitchFollows, twitchStreamEvents, twitchStreamers, type TwitchStreamer } from "../data/schema";
import { twitchTags } from "./cache-tags";

const EVENT_TYPES: StreamEventType[] = ["stream.online", "stream.offline"];
// service 不能 import 模組根目錄的 info.ts，模組 id 寫在這裡（與 info.ts 的 id 相同）
const MODULE_ID = "twitch";

/** 「同步訂閱」每個人每分鐘只能按一次：按一次就要對每位主播呼叫 Twitch API */
const MANUAL_SYNC_COOLDOWN_MS = 60_000;

/** 這些狀態的訂閱不會再收到通知，同步時刪掉重建 */
const HEALTHY_STATUSES = new Set(["enabled", "webhook_callback_verification_pending"]);

export class TwitchUserError extends Error {}

/** 還沒設定 Twitch 應用程式時直接說要去哪裡設定，不要只顯示「加入主播失敗（詳見伺服器 log）」 */
function requireTwitchSetup(): void {
  const missing = missingTwitchEnv();
  if (missing.includes("TWITCH_CLIENT_ID") || missing.includes("TWITCH_CLIENT_SECRET")) {
    throw new TwitchUserError("尚未設定 Twitch 應用程式：請到 Vercel 的環境變數加上 TWITCH_CLIENT_ID 與 TWITCH_CLIENT_SECRET，重新部署後再試");
  }
  if (missing.length > 0) throw new TwitchUserError(`Twitch 的環境變數還沒設定好：請到 Vercel 確認 ${missing.join("、")}，重新部署後再試`);
}

/** Twitch 回錯誤時多記狀態碼；回應原文可能帶有設定內容，不記 */
const twitchStatus = (error: unknown) => (error instanceof TwitchApiError ? [error.status] : []);

/** 接受 login、@login 或 twitch.tv/login 網址 */
export function normalizeLogin(input: string): string {
  return input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

/** 主播表的欄位，但 notifyEnabled 換成這個使用者自己的開關（twitch_follows），不是主播表裡單人版的舊欄位 */
export type FollowedStreamer = TwitchStreamer;

// 每個函式的 userId 都是登入者（Server Action 與頁面從 session 拿）：只讀寫他自己的追蹤

/** 使用者追蹤的主播，直播中的排前面 */
export async function listFollowedStreamers(userId: string): Promise<FollowedStreamer[]> {
  return db()
    .select({ ...getTableColumns(twitchStreamers), notifyEnabled: twitchFollows.notifyEnabled })
    .from(twitchFollows)
    .innerJoin(twitchStreamers, eq(twitchStreamers.id, twitchFollows.streamerId))
    .where(eq(twitchFollows.userId, userId))
    .orderBy(desc(twitchStreamers.isLive), twitchStreamers.login);
}

/** 回傳是否找到自己對這位主播的追蹤；關掉時開台照樣記錄，只是不通知這個使用者 */
export async function setStreamerNotify(userId: string, streamerId: number, enabled: boolean): Promise<boolean> {
  const updated = await db()
    .update(twitchFollows)
    .set({ notifyEnabled: enabled })
    .where(and(eq(twitchFollows.userId, userId), eq(twitchFollows.streamerId, streamerId)))
    .returning({ streamerId: twitchFollows.streamerId });
  return updated.length > 0;
}

/** 只列自己追蹤中的主播的紀錄：別人追蹤的主播不能從這裡被看出來 */
export async function recentEvents(userId: string, limit = 20) {
  return db()
    .select({
      id: twitchStreamEvents.id,
      type: twitchStreamEvents.type,
      title: twitchStreamEvents.title,
      category: twitchStreamEvents.category,
      receivedAt: twitchStreamEvents.receivedAt,
      broadcasterId: twitchStreamEvents.broadcasterId,
      displayName: twitchStreamers.displayName,
      login: twitchStreamers.login,
      profileImageUrl: twitchStreamers.profileImageUrl,
    })
    .from(twitchStreamEvents)
    .innerJoin(twitchStreamers, eq(twitchStreamers.broadcasterId, twitchStreamEvents.broadcasterId))
    .innerJoin(twitchFollows, and(eq(twitchFollows.streamerId, twitchStreamers.id), eq(twitchFollows.userId, userId)))
    .orderBy(desc(twitchStreamEvents.receivedAt))
    .limit(limit);
}

export async function addStreamer(userId: string, input: string): Promise<TwitchStreamer> {
  const login = normalizeLogin(input);
  if (!/^[a-z0-9_]{3,25}$/.test(login)) throw new TwitchUserError("Twitch 帳號格式不正確（3–25 個英數字或底線）");
  requireTwitchSetup();

  const [user] = await getUsersByLogin([login]);
  if (!user) throw new TwitchUserError(`找不到 Twitch 帳號「${login}」`);

  const profile = { login: user.login, displayName: user.display_name, profileImageUrl: user.profile_image_url };
  const { streamer, followed } = await db().transaction(async (tx) => {
    // 同一位主播大家共用一列與一組訂閱；upsert 會鎖住這一列到交易結束，最後一位追蹤者同時取消追蹤時不會把它刪掉
    const [row] = await tx
      .insert(twitchStreamers)
      .values({ broadcasterId: user.id, ...profile })
      .onConflictDoUpdate({ target: twitchStreamers.broadcasterId, set: profile })
      .returning();
    const [follow] = await tx.insert(twitchFollows).values({ userId, streamerId: row.id }).onConflictDoNothing().returning({ streamerId: twitchFollows.streamerId });
    return { streamer: row, followed: Boolean(follow) };
  });
  if (!followed) throw new TwitchUserError(`已經在追蹤「${user.display_name}」了`);

  // 第一次有人追蹤（或之前的訂閱失敗了）才建訂閱；訂閱失敗（例如本機沒有公開 HTTPS）也保留主播，狀態寫失敗原因，之後排程 sync 會補建
  return subscriptionsHealthy(streamer) ? streamer : ensureSubscriptions(streamer, new Map());
}

/** 只刪自己的追蹤；最後一位追蹤者取消時才刪主播與 Twitch 上的訂閱。不是自己追蹤的主播沒有效果 */
export async function removeStreamer(userId: string, streamerId: number): Promise<{ warning?: string }> {
  const orphan = await db().transaction(async (tx) => {
    // 鎖住主播：同時有人加追蹤時，等這裡決定刪不刪之後才繼續
    const [streamer] = await tx.select().from(twitchStreamers).where(eq(twitchStreamers.id, streamerId)).for("update");
    if (!streamer) return null;
    const removed = await tx
      .delete(twitchFollows)
      .where(and(eq(twitchFollows.userId, userId), eq(twitchFollows.streamerId, streamerId)))
      .returning({ streamerId: twitchFollows.streamerId });
    if (removed.length === 0) return null;
    const [{ followers }] = await tx.select({ followers: count() }).from(twitchFollows).where(eq(twitchFollows.streamerId, streamerId));
    if (followers > 0) return null;
    await tx.delete(twitchStreamers).where(eq(twitchStreamers.id, streamerId));
    return streamer;
  });
  if (!orphan) return {};
  return (await deleteSubscriptionsOf(orphan)) ? {} : { warning: `已刪除「${orphan.displayName}」，但 Twitch 上的訂閱沒有刪掉（之後收到的通知會被忽略）` };
}

/** 回傳是否都刪掉了；主播已經從資料庫刪除，Twitch 刪訂閱失敗（設定錯誤、網路）留下的孤兒訂閱，送來的通知會被 handleNotification 忽略 */
async function deleteSubscriptionsOf(streamer: TwitchStreamer): Promise<boolean> {
  let failed = false;
  for (const subscriptionId of [streamer.onlineSubscriptionId, streamer.offlineSubscriptionId]) {
    if (!subscriptionId) continue;
    try {
      await deleteSubscription(subscriptionId);
    } catch (error) {
      // Twitch 那邊已經不存在就當作刪除成功
      if (error instanceof TwitchApiError && error.status === 404) continue;
      failed = true;
      logError("twitch", "刪除訂閱失敗", error, subscriptionId, ...twitchStatus(error));
    }
  }
  return !failed;
}

/** existing 是 Twitch 上現有的訂閱（key：type:broadcasterId）；用 broadcaster 對應而不是資料庫存的 id，資料庫遺失 id 時才不會重複建立（Twitch 會回 409） */
async function ensureSubscriptions(streamer: TwitchStreamer, existing: Map<string, EventSubSubscription>): Promise<TwitchStreamer> {
  const ids: Partial<Record<StreamEventType, string | null>> = {};
  const statuses: string[] = [];

  for (const type of EVENT_TYPES) {
    let subscription = existing.get(`${type}:${streamer.broadcasterId}`);
    try {
      if (subscription && !HEALTHY_STATUSES.has(subscription.status)) {
        await deleteSubscription(subscription.id);
        subscription = undefined;
      }
      subscription ??= await createSubscription(type, streamer.broadcasterId);
      ids[type] = subscription.id;
      statuses.push(subscription.status);
    } catch (error) {
      ids[type] = null;
      statuses.push(subscriptionFailure(error));
      logError("twitch", "建立訂閱失敗", error, type, streamer.broadcasterId, ...twitchStatus(error));
    }
  }

  const [updated] = await db()
    .update(twitchStreamers)
    .set({
      onlineSubscriptionId: ids["stream.online"],
      offlineSubscriptionId: ids["stream.offline"],
      subscriptionStatus: [...new Set(statuses)].join("；"),
    })
    .where(eq(twitchStreamers.id, streamer.id))
    .returning();
  return updated;
}

/** 對照 Twitch 上的訂閱清單更新狀態，缺的或壞掉的重建；沒有人追蹤的主播（例如最後一位追蹤者刪除了帳號）連同訂閱一起刪掉 */
export async function syncSubscriptions(): Promise<string> {
  const subscriptions = await listSubscriptions();
  const callback = eventSubCallbackUrl();
  const existing = new Map(
    subscriptions
      // 開發與正式共用同一個 Twitch 應用程式時，別的環境建的訂閱通知不會送到這裡
      .filter((s) => s.condition?.broadcaster_user_id && s.transport?.callback === callback)
      .map((s) => [`${s.type}:${s.condition!.broadcaster_user_id}`, s] as const),
  );

  const streamers = await db()
    .select({ streamer: twitchStreamers, followers: count(twitchFollows.userId) })
    .from(twitchStreamers)
    .leftJoin(twitchFollows, eq(twitchFollows.streamerId, twitchStreamers.id))
    .groupBy(twitchStreamers.id)
    .orderBy(twitchStreamers.login);
  let healthy = 0;
  let removed = 0;
  for (const { streamer, followers } of streamers) {
    if (followers === 0) {
      if (await removeUnfollowed(streamer)) removed++;
      continue;
    }
    const updated = await ensureSubscriptions(streamer, existing);
    if (subscriptionsHealthy(updated)) healthy++;
  }
  const kept = streamers.length - removed;
  return `${kept} 位主播，${healthy} 位訂閱正常；Twitch 上共 ${subscriptions.length} 個訂閱${removed ? `；刪除 ${removed} 位沒有人追蹤的主播` : ""}`;
}

/** 使用者按「同步訂閱」：處理的是全站共用的訂閱（誰按都一樣），但回應只說他自己追蹤的主播，不透露全站有多少主播與訂閱 */
export async function syncSubscriptionsFor(userId: string, now = new Date()): Promise<string> {
  requireTwitchSetup();
  const wait = await takeCooldown("twitch:sync", userId, MANUAL_SYNC_COOLDOWN_MS, now);
  if (wait > 0) throw new TwitchUserError(`剛剛才同步過，請 ${wait} 秒後再試`);
  await syncSubscriptions();
  const mine = await listFollowedStreamers(userId);
  if (mine.length === 0) return "已同步。你還沒有追蹤任何主播";
  return `已同步你追蹤的 ${mine.length} 位主播，${mine.filter(subscriptionsHealthy).length} 位訂閱正常`;
}

/** 刪除前在交易裡再確認一次沒有人追蹤：剛好有人在這時候加追蹤就留著 */
async function removeUnfollowed(streamer: TwitchStreamer): Promise<boolean> {
  const deleted = await db().transaction(async (tx) => {
    const [locked] = await tx.select({ id: twitchStreamers.id }).from(twitchStreamers).where(eq(twitchStreamers.id, streamer.id)).for("update");
    if (!locked) return false;
    const [{ followers }] = await tx.select({ followers: count() }).from(twitchFollows).where(eq(twitchFollows.streamerId, streamer.id));
    if (followers > 0) return false;
    await tx.delete(twitchStreamers).where(eq(twitchStreamers.id, streamer.id));
    return true;
  });
  if (deleted) await deleteSubscriptionsOf(streamer);
  return deleted;
}

/** 開台通知送達時 Helix /streams 常常還查不到這場直播 */
const STREAM_LOOKUP_RETRIES = 2;
const STREAM_LOOKUP_DELAY_MS = 3000;

export type NotificationOptions = {
  /** 查直播資訊與推通知要延到回應之後（route 傳 next/server 的 after），預設立即執行 */
  defer?: (task: () => Promise<void>) => void;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function handleNotification(
  messageId: string,
  subscription: EventSubSubscription,
  event: StreamEvent,
  { defer, sleep = wait }: NotificationOptions = {},
): Promise<void> {
  const type = subscription.type === "stream.online" ? "online" : subscription.type === "stream.offline" ? "offline" : null;
  if (!type) return;

  // 已經沒有這位主播、但 Twitch 上的訂閱還沒刪掉時會收到這種通知，直接忽略
  const [tracked] = await db().select({ id: twitchStreamers.id }).from(twitchStreamers).where(eq(twitchStreamers.broadcasterId, event.broadcaster_user_id));
  if (!tracked) return;

  // 先用 message_id 佔位去重，Twitch 重送時就不會重查直播資訊或重複通知
  const [inserted] = await db()
    .insert(twitchStreamEvents)
    .values({
      messageId,
      broadcasterId: event.broadcaster_user_id,
      type,
      startedAt: event.started_at ? new Date(event.started_at) : undefined,
    })
    .onConflictDoNothing({ target: twitchStreamEvents.messageId })
    .returning({ id: twitchStreamEvents.id });
  if (!inserted) return;

  await db().update(twitchStreamers).set({ isLive: type === "online" }).where(eq(twitchStreamers.id, tracked.id));
  // webhook 寫入：下一個請求就要看到開台／關台，不能先給舊的
  expireTags(twitchTags.events, twitchTags.streamers);

  if (type !== "online") return;

  const announce = async () => {
    try {
      await announceOnline(inserted.id, tracked.id, event, sleep);
    } catch (error) {
      logError("twitch", "開台通知失敗", error, ...twitchStatus(error));
    }
  };
  if (defer) defer(announce);
  else await announce();
}

/** 開台通知本身沒有標題和分類，要另外查（查不到才重試）；查不到不影響紀錄與通知；沒有人要收通知時照樣補上直播資訊 */
async function announceOnline(eventId: number, streamerId: number, event: StreamEvent, sleep: (ms: number) => Promise<void>): Promise<void> {
  let stream: { title: string; game_name: string } | undefined;
  for (let attempt = 0; attempt <= STREAM_LOOKUP_RETRIES && !stream; attempt++) {
    if (attempt > 0) await sleep(STREAM_LOOKUP_DELAY_MS);
    try {
      [stream] = await getStreams([event.broadcaster_user_id]);
    } catch (error) {
      // 丟錯通常是設定或權限問題，重試也不會好
      logError("twitch", "查詢直播資訊失敗", error, ...twitchStatus(error));
      break;
    }
  }
  if (stream) {
    await db().update(twitchStreamEvents).set({ title: stream.title, category: stream.game_name }).where(eq(twitchStreamEvents.id, eventId));
    expireTags(twitchTags.events);
  }

  // 查完直播資訊才讀追蹤者：等待重試的這幾秒裡改的通知開關也算數
  const followers = await db()
    .select({ userId: twitchFollows.userId })
    .from(twitchFollows)
    .where(and(eq(twitchFollows.streamerId, streamerId), eq(twitchFollows.notifyEnabled, true)));
  if (followers.length === 0) return;
  const lines = [stream?.title, stream?.game_name && `分類：${stream.game_name}`].filter((line): line is string => !!line);
  await notify({
    recipients: followers.map((follower) => follower.userId),
    module: MODULE_ID,
    kind: "stream_online",
    title: `${event.broadcaster_user_name} 開台了`,
    body: lines.join("\n"),
    url: `https://twitch.tv/${event.broadcaster_user_login}`,
  });
}

/** 開台／關台紀錄只留最近 RETENTION_DAYS 天；EventSub 只收 10 分鐘內的訊息，刪舊紀錄不影響 message id 去重 */
export async function cleanupStreamEvents(now = new Date()): Promise<string> {
  const deleted = await db()
    .delete(twitchStreamEvents)
    .where(lt(twitchStreamEvents.receivedAt, retentionCutoff(now)))
    .returning({ id: twitchStreamEvents.id });
  return `刪除 ${deleted.length} 筆超過 ${RETENTION_DAYS} 天的開台／關台紀錄`;
}

export async function handleRevocation(subscription: EventSubSubscription): Promise<void> {
  const column = subscription.type === "stream.online" ? "onlineSubscriptionId" : "offlineSubscriptionId";
  const updated = await db()
    .update(twitchStreamers)
    .set({ [column]: null, subscriptionStatus: `訂閱已被撤銷：${subscription.status}` })
    .where(or(eq(twitchStreamers.onlineSubscriptionId, subscription.id), eq(twitchStreamers.offlineSubscriptionId, subscription.id)))
    .returning({ id: twitchStreamers.id });
  if (updated.length > 0) expireTags(twitchTags.streamers);
}
