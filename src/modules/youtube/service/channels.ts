import "server-only";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { db } from "@/core/db";
import { youtubeEnv } from "@/core/env";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { RETENTION_DAYS, retentionCutoff } from "@/core/retention";
import { fetchChannelFeed, hubRequest, resolveHandle } from "../lib/api";
import { parseChannelInput } from "../lib/parse";
import { watchPagePath, youtubeWatchUrl } from "../lib/urls";
import { youtubeChannels, youtubeTranslations, youtubeVideos, type YoutubeChannel, type ZhCaptionStatus } from "../data/schema";
import { channelIdFromTopic, subscriptionFailure, verifyCallbackToken, type FeedEntry, type Verification } from "../lib/websub";
import { youtubeTags } from "./cache-tags";
import { checkChineseCaptions } from "./caption-status";

/** 推送的影片發布超過這麼久就不通知：hub 在舊影片改標題、說明時也會推送 */
const NOTIFY_WINDOW_MS = 24 * 3600_000;
const RENEW_BEFORE_MS = 2 * 24 * 3600_000;
// service 不能 import 模組根目錄的 info.ts，模組 id 寫在這裡（與 info.ts 的 id 相同）
const MODULE_ID = "youtube";

/** 有中文就直接去 YouTube 看；沒有才到自己的網站翻譯觀看；不確定時給 YouTube 連結讓使用者自己看 */
const CAPTION_NOTICE: Record<ZhCaptionStatus, string> = {
  yes: "有中文字幕，可以直接看",
  no: "沒有中文字幕，用翻譯觀看",
  unknown: "無法確認是否有中文字幕",
};
const videoLink = (videoId: string, status: ZhCaptionStatus) => (status === "no" ? watchPagePath(videoId) : youtubeWatchUrl(videoId));

export class YoutubeUserError extends Error {}

export async function listChannels(): Promise<YoutubeChannel[]> {
  return db().select().from(youtubeChannels).orderBy(youtubeChannels.title);
}

/** 回傳是否找到頻道；關掉時新影片照樣記錄，只是不建立網站通知 */
export async function setChannelNotify(id: number, enabled: boolean): Promise<boolean> {
  const updated = await db().update(youtubeChannels).set({ notifyEnabled: enabled }).where(eq(youtubeChannels.id, id)).returning({ id: youtubeChannels.id });
  return updated.length > 0;
}

export async function recentVideos(limit = 30) {
  return db()
    .select({
      videoId: youtubeVideos.videoId,
      title: youtubeVideos.title,
      publishedAt: youtubeVideos.publishedAt,
      zhCaptions: youtubeVideos.zhCaptions,
      zhCaptionsCheckedAt: youtubeVideos.zhCaptionsCheckedAt,
      channelTitle: youtubeChannels.title,
      translationStatus: youtubeTranslations.status,
    })
    .from(youtubeVideos)
    .leftJoin(youtubeChannels, eq(youtubeChannels.channelId, youtubeVideos.channelId))
    .leftJoin(youtubeTranslations, eq(youtubeTranslations.videoId, youtubeVideos.videoId))
    .orderBy(desc(youtubeVideos.publishedAt))
    .limit(limit);
}

/** 追蹤中頻道推送過的影片才有標題；其他影片回 null */
export async function videoTitle(videoId: string): Promise<string | null> {
  const [video] = await db().select({ title: youtubeVideos.title }).from(youtubeVideos).where(eq(youtubeVideos.videoId, videoId));
  return video?.title ?? null;
}

export async function addChannel(input: string): Promise<YoutubeChannel> {
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

  const [inserted] = await db()
    .insert(youtubeChannels)
    .values({ channelId, title: feed.title ?? channelId, thumbnail })
    .onConflictDoNothing({ target: youtubeChannels.channelId })
    .returning();
  if (!inserted) throw new YoutubeUserError(`已經在追蹤「${feed.title ?? channelId}」了`);

  // 本機沒有公開 HTTPS 時 hub 會拒絕，仍保留頻道，之後排程 renew 會再試
  return subscribe(inserted);
}

/** 先寫 pending 再送出：hub 可能在請求回來之前就回呼確認，順序反過來會把 subscribed 蓋回 pending */
async function subscribe(channel: YoutubeChannel): Promise<YoutubeChannel> {
  const byId = eq(youtubeChannels.id, channel.id);
  const [pending] = await db().update(youtubeChannels).set({ subscriptionStatus: "pending" }).where(byId).returning();
  if (!pending) return channel; // 期間被刪除了，不用再訂閱
  try {
    await hubRequest("subscribe", channel.channelId);
    return pending;
  } catch (error) {
    logError("youtube", "訂閱失敗", error, channel.channelId);
    // 只蓋掉自己寫的 pending：請求逾時但 hub 其實已經確認時，不要把 subscribed 改成失敗
    const [failed] = await db()
      .update(youtubeChannels)
      .set({ subscriptionStatus: subscriptionFailure(error) })
      .where(and(byId, eq(youtubeChannels.subscriptionStatus, "pending")))
      .returning();
    return failed ?? pending;
  }
}

/** 先刪除再取消訂閱，否則 hub 立刻回呼確認時資料列還在會被拒絕、留下孤兒訂閱；取消失敗仍刪除，留下的訂閱推送會因頻道不在追蹤中被忽略、租約到期後失效 */
export async function removeChannel(id: number): Promise<{ warning?: string }> {
  const [channel] = await db().delete(youtubeChannels).where(eq(youtubeChannels.id, id)).returning();
  if (!channel) return {};

  try {
    await hubRequest("unsubscribe", channel.channelId);
    return {};
  } catch (error) {
    logError("youtube", "取消訂閱失敗", error, channel.channelId);
    return { warning: `已刪除「${channel.title}」，但 hub 上的訂閱沒有取消（之後的通知會被忽略，租約到期後失效）` };
  }
}

/** 回傳要原樣回給 hub 的 challenge、null 代表拒絕（回 404）；三種 mode 都要帶對 k，訂閱只確認追蹤中的頻道、退訂只確認已刪除的頻道，避免別人替我們退訂 */
export async function handleVerification(request: Verification): Promise<string | null> {
  const channelId = channelIdFromTopic(request.topic);
  if (!channelId || !verifyCallbackToken(channelId, request.token, youtubeEnv().YOUTUBE_WEBSUB_SECRET)) return null;
  const [channel] = await db().select().from(youtubeChannels).where(eq(youtubeChannels.channelId, channelId));

  if (request.mode === "denied") {
    if (channel) {
      const reason = request.reason ? `（${request.reason}）` : "";
      await db().update(youtubeChannels).set({ subscriptionStatus: `訂閱失敗：hub 拒絕${reason}` }).where(eq(youtubeChannels.id, channel.id));
      // 只在確實寫入時失效：這個端點公開，沒帶對 k 的請求不能拿來一直打掉快取
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
  /** 檢查中文字幕與推通知延到回應之後（route 傳 next/server 的 after），預設立即執行 */
  defer?: (task: () => Promise<void>) => void;
};

export async function handleFeed(entries: FeedEntry[], { defer }: FeedOptions = {}): Promise<void> {
  const fresh = entries.filter((e) => e.published && Date.now() - e.published.getTime() <= NOTIFY_WINDOW_MS);
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
        // 關掉通知的頻道也檢查：影片清單要顯示有沒有中文字幕
        const status = await captionStatusOf(entry.videoId);
        if (!channel.notifyEnabled) return;
        await notify({
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
        // 延後的工作寫了字幕狀態與通知時間；通知本身由 notify() 讓通知的 tag 失效
        expireTags(youtubeTags.videos);
      }
    };
    if (defer) defer(announce);
    else await announce();
  }
  if (recorded > 0) expireTags(youtubeTags.videos);
}

/** 檢查字幕出錯不能讓通知發不出去，當作無法確認 */
async function captionStatusOf(videoId: string): Promise<ZhCaptionStatus> {
  try {
    return (await checkChineseCaptions(videoId)) ?? "unknown";
  } catch (error) {
    logError("youtube", "檢查中文字幕失敗", error);
    return "unknown";
  }
}

/** 新影片紀錄只留最近 RETENTION_DAYS 天；發布時間也要超過才刪，hub 之後再推送同一支影片時才一定在 24 小時通知窗外、不會重複通知 */
export async function cleanupVideos(now = new Date()): Promise<string> {
  const cutoff = retentionCutoff(now);
  const deleted = await db()
    .delete(youtubeVideos)
    .where(and(lt(youtubeVideos.createdAt, cutoff), or(isNull(youtubeVideos.publishedAt), lt(youtubeVideos.publishedAt, cutoff))))
    .returning({ id: youtubeVideos.id });
  return `刪除 ${deleted.length} 筆超過 ${RETENTION_DAYS} 天的新影片紀錄`;
}

/** 租約快到期、沒有租約（hub 還沒確認）或失敗的頻道重新訂閱 */
export async function renewSubscriptions(): Promise<string> {
  const channels = await listChannels();
  const due = channels.filter(
    (c) => c.subscriptionStatus !== "subscribed" || !c.leaseExpiresAt || c.leaseExpiresAt.getTime() - Date.now() < RENEW_BEFORE_MS,
  );

  let failed = 0;
  for (const channel of due) {
    const updated = await subscribe(channel);
    if (updated.subscriptionStatus?.startsWith("訂閱失敗")) failed++;
  }
  return `${channels.length} 個頻道，續訂 ${due.length} 個${failed ? `（${failed} 個失敗）` : ""}`;
}
