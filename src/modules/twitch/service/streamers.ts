import "server-only";
import { desc, eq, lt, or } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { db } from "@/core/db";
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
import { twitchStreamEvents, twitchStreamers, type TwitchStreamer } from "../data/schema";
import { twitchTags } from "./cache-tags";

const EVENT_TYPES: StreamEventType[] = ["stream.online", "stream.offline"];
// service 不能 import 模組根目錄的 info.ts，模組 id 寫在這裡（與 info.ts 的 id 相同）
const MODULE_ID = "twitch";

/** 這些狀態的訂閱不會再收到通知，同步時刪掉重建 */
const HEALTHY_STATUSES = new Set(["enabled", "webhook_callback_verification_pending"]);

export class TwitchUserError extends Error {}

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

export async function listStreamers(): Promise<TwitchStreamer[]> {
  return db().select().from(twitchStreamers).orderBy(desc(twitchStreamers.isLive), twitchStreamers.login);
}

/** 回傳是否找到主播；關掉時開台照樣記錄，只是不建立網站通知 */
export async function setStreamerNotify(id: number, enabled: boolean): Promise<boolean> {
  const updated = await db().update(twitchStreamers).set({ notifyEnabled: enabled }).where(eq(twitchStreamers.id, id)).returning({ id: twitchStreamers.id });
  return updated.length > 0;
}

export async function recentEvents(limit = 20) {
  return db()
    .select({
      id: twitchStreamEvents.id,
      type: twitchStreamEvents.type,
      title: twitchStreamEvents.title,
      category: twitchStreamEvents.category,
      receivedAt: twitchStreamEvents.receivedAt,
      displayName: twitchStreamers.displayName,
      login: twitchStreamers.login,
    })
    .from(twitchStreamEvents)
    .leftJoin(twitchStreamers, eq(twitchStreamers.broadcasterId, twitchStreamEvents.broadcasterId))
    .orderBy(desc(twitchStreamEvents.receivedAt))
    .limit(limit);
}

export async function addStreamer(input: string): Promise<TwitchStreamer> {
  const login = normalizeLogin(input);
  if (!/^[a-z0-9_]{3,25}$/.test(login)) throw new TwitchUserError("Twitch 帳號格式不正確（3–25 個英數字或底線）");

  const [user] = await getUsersByLogin([login]);
  if (!user) throw new TwitchUserError(`找不到 Twitch 帳號「${login}」`);

  const [inserted] = await db()
    .insert(twitchStreamers)
    .values({ broadcasterId: user.id, login: user.login, displayName: user.display_name, profileImageUrl: user.profile_image_url })
    .onConflictDoNothing({ target: twitchStreamers.broadcasterId })
    .returning();
  if (!inserted) throw new TwitchUserError(`已經在追蹤「${user.display_name}」了`);

  // 訂閱失敗（例如本機沒有公開 HTTPS）也保留主播，狀態寫失敗原因，之後排程 sync 會補建
  return ensureSubscriptions(inserted, new Map());
}

/** Twitch 刪訂閱失敗（設定錯誤、網路）時仍刪掉主播：孤兒訂閱送來的通知會被 handleNotification 忽略，warning 讓畫面提醒使用者 */
export async function removeStreamer(id: number): Promise<{ warning?: string }> {
  const [streamer] = await db().select().from(twitchStreamers).where(eq(twitchStreamers.id, id));
  if (!streamer) return {};

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
  await db().delete(twitchStreamers).where(eq(twitchStreamers.id, id));
  return failed ? { warning: `已刪除「${streamer.displayName}」，但 Twitch 上的訂閱沒有刪掉（之後收到的通知會被忽略）` } : {};
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

/** 對照 Twitch 上的訂閱清單更新狀態，缺的或壞掉的重建 */
export async function syncSubscriptions(): Promise<string> {
  const subscriptions = await listSubscriptions();
  const callback = eventSubCallbackUrl();
  const existing = new Map(
    subscriptions
      // 開發與正式共用同一個 Twitch 應用程式時，別的環境建的訂閱通知不會送到這裡
      .filter((s) => s.condition?.broadcaster_user_id && s.transport?.callback === callback)
      .map((s) => [`${s.type}:${s.condition!.broadcaster_user_id}`, s] as const),
  );

  const streamers = await listStreamers();
  let healthy = 0;
  for (const streamer of streamers) {
    const updated = await ensureSubscriptions(streamer, existing);
    if (subscriptionsHealthy(updated)) healthy++;
  }
  return `${streamers.length} 位主播，${healthy} 位訂閱正常；Twitch 上共 ${subscriptions.length} 個訂閱`;
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

  // 已取消追蹤、但 Twitch 上的訂閱還沒刪掉時會收到這種通知，直接忽略
  const [tracked] = await db()
    .select({ id: twitchStreamers.id, notifyEnabled: twitchStreamers.notifyEnabled })
    .from(twitchStreamers)
    .where(eq(twitchStreamers.broadcasterId, event.broadcaster_user_id));
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
      await announceOnline(inserted.id, event, sleep, tracked.notifyEnabled);
    } catch (error) {
      logError("twitch", "開台通知失敗", error, ...twitchStatus(error));
    }
  };
  if (defer) defer(announce);
  else await announce();
}

/** 開台通知本身沒有標題和分類，要另外查（查不到才重試）；查不到不影響紀錄與通知；關掉通知時照樣補上直播資訊 */
async function announceOnline(eventId: number, event: StreamEvent, sleep: (ms: number) => Promise<void>, notifyEnabled: boolean): Promise<void> {
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

  if (!notifyEnabled) return;
  const lines = [stream?.title, stream?.game_name && `分類：${stream.game_name}`].filter((line): line is string => !!line);
  await notify({
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
