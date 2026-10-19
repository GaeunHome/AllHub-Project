import "server-only";
import { and, count, eq, getTableColumns, inArray } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { takeCooldown } from "@/core/cooldown";
import { db } from "@/core/db";
import { youtubeEnv } from "@/core/env";
import { logError } from "@/core/errors";
import { UserError } from "@/core/form";
import { notify } from "@/core/notify";
import { DAY_MS } from "@/core/time";
import { checkIsShort, fetchChannelFeed, hubRequest, resolveHandle } from "../lib/api";
import { parseChannelInput } from "../lib/parse";
import { watchPagePath, youtubeWatchUrl } from "../lib/urls";
import { youtubeChannels, youtubeFollows, youtubeVideos, type FollowedChannel, type YoutubeChannel, type ZhCaptionStatus } from "../data/schema";
import {
  SUBSCRIPTION_FAILED,
  channelIdFromTopic,
  isSubscriptionFailure,
  subscriptionFailure,
  verifyCallbackToken,
  type FeedEntry,
  type Verification,
} from "../lib/websub";
import { youtubeTags } from "./cache-tags";
import { checkChineseCaptions } from "./caption-status";

/** 推送的影片發布超過這麼久就不通知 hub 在舊影片改標題或說明時也會推送 */
const NOTIFY_WINDOW_MS = DAY_MS;
const RENEW_BEFORE_MS = 2 * DAY_MS;
/** 續訂每人每分鐘只能按一次 按一次就可能對很多頻道呼叫 hub */
const MANUAL_RENEW_COOLDOWN_MS = 60_000;
// service 不能 import 根目錄的 info.ts 所以模組 id 寫在這裡
const MODULE_ID = "youtube";

/** 有中文就直接去 YouTube 看 沒有才到站內翻譯觀看 不確定時給 YouTube 連結自己看 */
const CAPTION_NOTICE: Record<ZhCaptionStatus, string> = {
  yes: "有中文字幕，可以直接看",
  no: "沒有中文字幕，用翻譯觀看",
  unknown: "無法確認是否有中文字幕",
};
const videoLink = (videoId: string, status: ZhCaptionStatus) => (status === "no" ? watchPagePath(videoId) : youtubeWatchUrl(videoId));

export class YoutubeUserError extends UserError {}

// 每個函式的 userId 都是登入者 只讀寫他自己的追蹤

export async function listFollowedChannels(userId: string): Promise<FollowedChannel[]> {
  return db()
    .select({ ...getTableColumns(youtubeChannels), notifyEnabled: youtubeFollows.notifyEnabled })
    .from(youtubeFollows)
    .innerJoin(youtubeChannels, eq(youtubeChannels.channelId, youtubeFollows.channelId))
    .where(eq(youtubeFollows.userId, userId))
    .orderBy(youtubeChannels.title);
}

/** 回傳有沒有找到自己的追蹤 id 是頻道表的 id 關掉時新影片照樣記錄只是不通知 */
export async function setChannelNotify(userId: string, id: number, enabled: boolean): Promise<boolean> {
  const updated = await db()
    .update(youtubeFollows)
    .set({ notifyEnabled: enabled })
    .where(
      and(
        eq(youtubeFollows.userId, userId),
        inArray(youtubeFollows.channelId, db().select({ channelId: youtubeChannels.channelId }).from(youtubeChannels).where(eq(youtubeChannels.id, id))),
      ),
    )
    .returning({ channelId: youtubeFollows.channelId });
  return updated.length > 0;
}

/**
 * 開始翻譯時存進翻譯紀錄的標題 任何人追蹤的頻道的影片都查得到
 * 翻譯是共用的 標題也是公開資訊
 */
export async function videoTitle(videoId: string): Promise<string | null> {
  const [video] = await db().select({ title: youtubeVideos.title }).from(youtubeVideos).where(eq(youtubeVideos.videoId, videoId));
  return video?.title ?? null;
}

export async function addChannel(userId: string, input: string): Promise<YoutubeChannel> {
  const parsed = parseChannelInput(input);
  if (!parsed) throw new YoutubeUserError("請輸入頻道網址、@帳號或 UC 開頭的頻道 ID");

  let channelId: string;
  let thumbnail: string | null = null;
  if (parsed.kind === "handle") {
    const resolved = await resolveHandle(parsed.handle);
    if (!resolved) throw new YoutubeUserError(`找不到頻道「@${parsed.handle}」`);
    ({ channelId, thumbnail } = resolved);
  } else {
    channelId = parsed.channelId;
  }

  const feed = await fetchChannelFeed(channelId);
  if (!feed) throw new YoutubeUserError(`找不到頻道「${channelId}」`);

  const title = feed.title ?? channelId;
  const { channel, created, followed } = await db().transaction(async (tx) => {
    // 同一個頻道大家共用一列與一個 WebSub 訂閱
    // 鎖住這一列到交易結束 最後一位追蹤者同時取消時才不會把它刪掉
    const insert = () => tx.insert(youtubeChannels).values({ channelId, title, thumbnail }).onConflictDoNothing({ target: youtubeChannels.channelId }).returning();
    let [row] = await insert();
    let created = Boolean(row);
    if (!row) [row] = await tx.select().from(youtubeChannels).where(eq(youtubeChannels.channelId, channelId)).for("update");
    // 等鎖時剛好被最後一位追蹤者刪掉 就當成第一次追蹤重新建立
    if (!row) {
      [row] = await insert();
      created = true;
    }
    const [follow] = await tx.insert(youtubeFollows).values({ userId, channelId }).onConflictDoNothing().returning({ channelId: youtubeFollows.channelId });
    return { channel: row, created, followed: Boolean(follow) };
  });
  if (!followed) throw new YoutubeUserError(`已經在追蹤「${title}」了`);

  await backfillVideos(channelId, feed.entries, created);
  // 已經有人追蹤的頻道沿用原本的訂閱 失敗了才趁新的追蹤者加入時再試一次
  // 本機沒有公開 HTTPS 時 hub 會拒絕 頻道照樣保留 之後 renew 排程會再試
  return created || isSubscriptionFailure(channel.subscriptionStatus) ? subscribe(channel) : channel;
}

/**
 * 追蹤時從 RSS 補進最近的影片 不發通知 新追蹤的人馬上看得到
 * 已經有人追蹤的頻道 24 小時內的影片交給推送 照常通知所有追蹤者
 */
async function backfillVideos(channelId: string, entries: FeedEntry[], newChannel: boolean): Promise<void> {
  const cutoff = Date.now() - NOTIFY_WINDOW_MS;
  const videos = entries
    .filter((entry) => entry.channelId === channelId && !entry.isShort && entry.published && (newChannel || entry.published.getTime() < cutoff))
    .map((entry) => ({ videoId: entry.videoId, channelId, title: entry.title, publishedAt: entry.published }));
  if (videos.length === 0) return;
  await db().insert(youtubeVideos).values(videos).onConflictDoNothing({ target: youtubeVideos.videoId });
}

/** 先寫 pending 再送出 hub 可能在請求回來前就確認 反過來會把 subscribed 蓋回 pending */
async function subscribe(channel: YoutubeChannel): Promise<YoutubeChannel> {
  const byId = eq(youtubeChannels.id, channel.id);
  const [pending] = await db().update(youtubeChannels).set({ subscriptionStatus: "pending" }).where(byId).returning();
  if (!pending) return channel; // 期間被刪掉了 不用再訂閱
  try {
    await hubRequest("subscribe", channel.channelId);
    return pending;
  } catch (error) {
    logError("youtube", "訂閱失敗", error, channel.channelId);
    // 只蓋掉自己寫的 pending 請求逾時但 hub 已經確認時 不要把 subscribed 改成失敗
    const [failed] = await db()
      .update(youtubeChannels)
      .set({ subscriptionStatus: subscriptionFailure(error) })
      .where(and(byId, eq(youtubeChannels.subscriptionStatus, "pending")))
      .returning();
    return failed ?? pending;
  }
}

/** 只刪自己的追蹤 最後一位取消時才刪頻道與 WebSub 訂閱 沒追蹤的頻道沒有效果 */
export async function removeChannel(userId: string, id: number): Promise<{ warning?: string }> {
  const orphan = await db().transaction(async (tx) => {
    // 鎖住頻道 同時有人加追蹤時 等這裡決定刪不刪之後才繼續
    const [channel] = await tx.select().from(youtubeChannels).where(eq(youtubeChannels.id, id)).for("update");
    if (!channel) return null;
    const removed = await tx
      .delete(youtubeFollows)
      .where(and(eq(youtubeFollows.userId, userId), eq(youtubeFollows.channelId, channel.channelId)))
      .returning({ channelId: youtubeFollows.channelId });
    if (removed.length === 0) return null;
    const [{ followers }] = await tx.select({ followers: count() }).from(youtubeFollows).where(eq(youtubeFollows.channelId, channel.channelId));
    if (followers > 0) return null;
    await tx.delete(youtubeChannels).where(eq(youtubeChannels.id, id));
    return channel;
  });
  if (!orphan) return {};
  return (await unsubscribe(orphan)) ? {} : { warning: `已刪除「${orphan.title}」，但 hub 上的訂閱沒有取消（之後的通知會被忽略，租約到期後失效）` };
}

/**
 * 頻道已經先從資料庫刪掉 hub 立刻回來確認時才會通過
 * 取消失敗留下的訂閱 推送會因為沒人追蹤被忽略 租約到期後失效
 */
async function unsubscribe(channel: YoutubeChannel): Promise<boolean> {
  try {
    await hubRequest("unsubscribe", channel.channelId);
    return true;
  } catch (error) {
    logError("youtube", "取消訂閱失敗", error, channel.channelId);
    return false;
  }
}

/**
 * 回傳要原樣回給 hub 的 challenge null 代表拒絕 三種 mode 都要帶對 k
 * 訂閱只確認追蹤中的頻道 退訂只確認已刪除的 免得別人替我們退訂
 */
export async function handleVerification(request: Verification): Promise<string | null> {
  const channelId = channelIdFromTopic(request.topic);
  if (!channelId || !verifyCallbackToken(channelId, request.token, youtubeEnv().YOUTUBE_WEBSUB_SECRET)) return null;
  const [channel] = await db().select().from(youtubeChannels).where(eq(youtubeChannels.channelId, channelId));

  if (request.mode === "denied") {
    if (channel) {
      const reason = request.reason ? `（${request.reason}）` : "";
      await db().update(youtubeChannels).set({ subscriptionStatus: `${SUBSCRIPTION_FAILED}hub 拒絕${reason}` }).where(eq(youtubeChannels.id, channel.id));
      // 只在真的寫入時失效 這個端點公開 沒帶對 k 的請求不能拿來一直打掉快取
      expireTags(youtubeTags.channels);
    }
    return null;
  }

  if (request.mode === "unsubscribe") return channel ? null : request.challenge;
  if (!channel) return null;

  const leaseExpiresAt = request.leaseSeconds ? new Date(Date.now() + request.leaseSeconds * 1000) : null;
  await db().update(youtubeChannels).set({ subscriptionStatus: "subscribed", leaseExpiresAt }).where(eq(youtubeChannels.id, channel.id));
  expireTags(youtubeTags.channels);
  return request.challenge;
}

export type FeedOptions = {
  /** 檢查中文字幕與通知延到回應之後 route 傳 after 進來 預設立即執行 */
  defer?: (task: () => Promise<void>) => void;
};

/** 新影片一律記錄給清單用 通知只送給追蹤而且開著通知的人 Shorts 都不收 */
export async function handleFeed(entries: FeedEntry[], { defer }: FeedOptions = {}): Promise<void> {
  const fresh = entries.filter((e) => !e.isShort && e.published && Date.now() - e.published.getTime() <= NOTIFY_WINDOW_MS);
  if (fresh.length === 0) return;

  const channels = await db()
    .select()
    .from(youtubeChannels)
    .where(inArray(youtubeChannels.channelId, [...new Set(fresh.map((e) => e.channelId))]));
  const byId = new Map(channels.map((c) => [c.channelId, c]));

  let recorded = 0;
  for (const entry of fresh) {
    const channel = byId.get(entry.channelId);
    if (!channel) continue;

    const [inserted] = await db()
      .insert(youtubeVideos)
      .values({ videoId: entry.videoId, channelId: entry.channelId, title: entry.title, publishedAt: entry.published })
      .onConflictDoNothing({ target: youtubeVideos.videoId })
      .returning({ id: youtubeVideos.id });
    if (!inserted) continue;
    recorded++;

    const announce = async () => {
      try {
        // 推送的連結常常看不出是不是 Shorts 再請求確認 是的話刪掉 不檢查字幕也不通知
        if (await confirmedShort(entry.videoId)) {
          await db().delete(youtubeVideos).where(eq(youtubeVideos.id, inserted.id));
          // 影片 id 是公開的 記下來才查得到推送的影片為什麼沒出現在清單上
          console.info("[youtube] 確認是 Shorts，刪除推送的影片", entry.videoId);
          return;
        }
        // 沒人要收通知也檢查 影片清單要顯示有沒有中文字幕
        const status = await captionStatusOf(entry.videoId);
        const recipients = await notifiedFollowers(entry.channelId);
        if (recipients.length === 0) return;
        await notify({
          recipients,
          module: MODULE_ID,
          kind: "new_video",
          title: `${channel.title} 發布了新影片`,
          body: `${entry.title}\n${CAPTION_NOTICE[status]}`,
          url: videoLink(entry.videoId, status),
        });
        await db().update(youtubeVideos).set({ notifiedAt: new Date() }).where(eq(youtubeVideos.id, inserted.id));
      } catch (error) {
        logError("youtube", "新影片通知失敗", error);
      } finally {
        // 延後的工作寫了字幕狀態與通知時間 通知本身由 notify 讓通知的 tag 失效
        expireTags(youtubeTags.videos);
      }
    };
    if (defer) defer(announce);
    else await announce();
  }
  if (recorded > 0) expireTags(youtubeTags.videos);
}

/** 檢查完字幕才讀追蹤者 這段時間裡改的通知開關也算數 */
async function notifiedFollowers(channelId: string): Promise<string[]> {
  const rows = await db()
    .select({ userId: youtubeFollows.userId })
    .from(youtubeFollows)
    .where(and(eq(youtubeFollows.channelId, channelId), eq(youtubeFollows.notifyEnabled, true)));
  return rows.map((row) => row.userId);
}

/** 被擋或出錯就當一般影片 寧可多列一支 Shorts 也不要漏掉一般影片的通知 */
async function confirmedShort(videoId: string): Promise<boolean> {
  try {
    return (await checkIsShort(videoId)) === true;
  } catch (error) {
    logError("youtube", "確認是不是 Shorts 失敗", error);
    return false;
  }
}

/** 檢查字幕出錯不能讓通知發不出去 當作無法確認 */
async function captionStatusOf(videoId: string): Promise<ZhCaptionStatus> {
  try {
    return (await checkChineseCaptions(videoId)) ?? "unknown";
  } catch (error) {
    logError("youtube", "檢查中文字幕失敗", error);
    return "unknown";
  }
}

/**
 * 租約快到期 hub 還沒確認或失敗的頻道重新訂閱
 * 沒人追蹤的頻道取消訂閱並刪掉 例如最後一位追蹤者刪了帳號
 */
export async function renewSubscriptions(): Promise<string> {
  const channels = await db()
    .select({ channel: youtubeChannels, followers: count(youtubeFollows.userId) })
    .from(youtubeChannels)
    .leftJoin(youtubeFollows, eq(youtubeFollows.channelId, youtubeChannels.channelId))
    .groupBy(youtubeChannels.id)
    .orderBy(youtubeChannels.title);
  const followed = channels.filter((c) => c.followers > 0).map((c) => c.channel);
  const due = followed.filter((c) => c.subscriptionStatus !== "subscribed" || !c.leaseExpiresAt || c.leaseExpiresAt.getTime() - Date.now() < RENEW_BEFORE_MS);

  let failed = 0;
  for (const channel of due) {
    const updated = await subscribe(channel);
    if (isSubscriptionFailure(updated.subscriptionStatus)) failed++;
  }
  let removed = 0;
  for (const { channel } of channels.filter((c) => c.followers === 0)) {
    if (await removeUnfollowed(channel)) removed++;
  }
  return `${followed.length} 個頻道，續訂 ${due.length} 個${failed ? `（${failed} 個失敗）` : ""}${removed ? `；刪除 ${removed} 個沒有人追蹤的頻道` : ""}`;
}

/**
 * 續訂按鈕處理的是全站共用的訂閱 誰按都一樣
 * 回應只說他自己追蹤的頻道 不透露全站有多少頻道
 */
export async function renewSubscriptionsFor(userId: string, now = new Date()): Promise<string> {
  const wait = await takeCooldown("youtube:renew", userId, MANUAL_RENEW_COOLDOWN_MS, now);
  if (wait > 0) throw new YoutubeUserError(`剛剛才續訂過，請 ${wait} 秒後再試`);
  await renewSubscriptions();
  const mine = await listFollowedChannels(userId);
  if (mine.length === 0) return "已檢查。你還沒有追蹤任何頻道";
  const failed = mine.filter((channel) => isSubscriptionFailure(channel.subscriptionStatus)).length;
  return `已檢查你追蹤的 ${mine.length} 個頻道的訂閱${failed ? `，${failed} 個失敗（打開頻道的選單可以看原因）` : ""}`;
}

/** 刪除前在交易裡再確認一次沒人追蹤 剛好有人加追蹤就留著 */
async function removeUnfollowed(channel: YoutubeChannel): Promise<boolean> {
  const deleted = await db().transaction(async (tx) => {
    const [locked] = await tx.select({ id: youtubeChannels.id }).from(youtubeChannels).where(eq(youtubeChannels.id, channel.id)).for("update");
    if (!locked) return false;
    const [{ followers }] = await tx.select({ followers: count() }).from(youtubeFollows).where(eq(youtubeFollows.channelId, channel.channelId));
    if (followers > 0) return false;
    await tx.delete(youtubeChannels).where(eq(youtubeChannels.id, channel.id));
    return true;
  });
  if (deleted) await unsubscribe(channel);
  return deleted;
}
