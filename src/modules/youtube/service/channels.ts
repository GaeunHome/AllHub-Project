import "server-only";
import { and, count, eq, getTableColumns, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { takeCooldown } from "@/core/cooldown";
import { db } from "@/core/db";
import { youtubeEnv } from "@/core/env";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { checkIsShort, fetchChannelFeed, hubRequest, resolveHandle } from "../lib/api";
import { parseChannelInput } from "../lib/parse";
import { watchPagePath, youtubeWatchUrl } from "../lib/urls";
import { youtubeChannels, youtubeFollows, youtubeTranslations, youtubeVideos, type YoutubeChannel, type ZhCaptionStatus } from "../data/schema";
import { channelIdFromTopic, subscriptionFailure, verifyCallbackToken, type FeedEntry, type Verification } from "../lib/websub";
import { youtubeTags } from "./cache-tags";
import { checkChineseCaptions } from "./caption-status";
import { LIST_LIMIT, allListedVideoIds, newestFirst } from "./video-list";

/** 推送的影片發布超過這麼久就不通知：hub 在舊影片改標題、說明時也會推送 */
const NOTIFY_WINDOW_MS = 24 * 3600_000;
const RENEW_BEFORE_MS = 2 * 24 * 3600_000;
/** 「續訂」每個人每分鐘只能按一次：按一次就可能對很多頻道呼叫 hub */
const MANUAL_RENEW_COOLDOWN_MS = 60_000;
/** 發布兩天內的影片不在任何人清單裡也先留著：hub 在 24 小時通知窗內重送時才找得到、不會重複通知 */
const KEEP_RECENT_MS = 48 * 3600_000;
/** 清理 Shorts 時同時讀幾個頻道的 RSS、同時確認幾支影片 */
const SHORTS_SWEEP_CONCURRENCY = 4;
/** 清理 Shorts（讀 RSS 加上逐支確認）的總時間：頻道多、YouTube 又慢時剩下的明天再試，排程才不會拖到被平台中斷而來不及做後面的刪除 */
const SHORTS_SWEEP_BUDGET_MS = 60_000;
/** RSS 與逐支確認只是用來找 Shorts，慢的不值得等滿 15 秒（跟頻道頭像一樣 5 秒） */
const SHORTS_REQUEST_TIMEOUT_MS = 5_000;
/** 每次最多逐支確認幾支：RSS 認不出來的一般影片每天都會再問一次，有上限才不會對 YouTube 發太多請求 */
const SHORTS_CHECK_LIMIT = 50;
const recentCutoff = (now: Date) => new Date(now.getTime() - KEEP_RECENT_MS);
/** 發布時間（沒有的用寫入時間）早於 cutoff；Date 要自己轉成字串：drizzle 只在跟欄位比較時才轉，正式環境的 postgres-js 收到 Date 物件會丟錯 */
const publishedBefore = (cutoff: Date) => sql`coalesce(${youtubeVideos.publishedAt}, ${youtubeVideos.createdAt}) < ${cutoff.toISOString()}::timestamptz`;
/** 已經通知過、發布不到 KEEP_RECENT_MS 的 Shorts 先留著：推送時沒確認到是 Shorts 而通知了，hub 在 24 小時內重送時要找得到這一列，才不會再通知一次 */
const removableShort = (now: Date) => or(isNull(youtubeVideos.notifiedAt), publishedBefore(recentCutoff(now)));
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

/** 頻道表的欄位，但 notifyEnabled 換成這個使用者自己的開關（youtube_follows），不是頻道表裡單人版的舊欄位 */
export type FollowedChannel = YoutubeChannel;

// 每個函式的 userId 都是登入者（Server Action 與頁面從 session 拿）：只讀寫他自己的追蹤；影片只列他追蹤的頻道
const followedChannelIds = (userId: string) => db().select({ channelId: youtubeFollows.channelId }).from(youtubeFollows).where(eq(youtubeFollows.userId, userId));

export async function listFollowedChannels(userId: string): Promise<FollowedChannel[]> {
  return db()
    .select({ ...getTableColumns(youtubeChannels), notifyEnabled: youtubeFollows.notifyEnabled })
    .from(youtubeFollows)
    .innerJoin(youtubeChannels, eq(youtubeChannels.channelId, youtubeFollows.channelId))
    .where(eq(youtubeFollows.userId, userId))
    .orderBy(youtubeChannels.title);
}

/** 回傳是否找到自己對這個頻道的追蹤；id 是頻道表的 id。關掉時新影片照樣記錄，只是不通知這個使用者 */
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

/** 自己追蹤頻道的最新 LIST_LIMIT 支影片（跟 listedVideoIds 同一個範圍） */
export async function recentVideos(userId: string) {
  return db()
    .select({
      videoId: youtubeVideos.videoId,
      title: youtubeVideos.title,
      publishedAt: youtubeVideos.publishedAt,
      zhCaptions: youtubeVideos.zhCaptions,
      zhCaptionsCheckedAt: youtubeVideos.zhCaptionsCheckedAt,
      channelId: youtubeVideos.channelId,
      channelTitle: youtubeChannels.title,
      channelThumbnail: youtubeChannels.thumbnail,
      translationStatus: youtubeTranslations.status,
    })
    .from(youtubeVideos)
    .innerJoin(youtubeFollows, and(eq(youtubeFollows.channelId, youtubeVideos.channelId), eq(youtubeFollows.userId, userId)))
    .leftJoin(youtubeChannels, eq(youtubeChannels.channelId, youtubeVideos.channelId))
    .leftJoin(youtubeTranslations, eq(youtubeTranslations.videoId, youtubeVideos.videoId))
    .orderBy(...newestFirst)
    .limit(LIST_LIMIT);
}

/** 觀看頁上方的頻道：只有自己追蹤的頻道的影片查得到，其他影片回 null（畫面改用 oEmbed） */
export async function videoChannel(userId: string, videoId: string): Promise<{ channelId: string; channelTitle: string | null; thumbnail: string | null } | null> {
  const [row] = await db()
    .select({ channelId: youtubeVideos.channelId, channelTitle: youtubeChannels.title, thumbnail: youtubeChannels.thumbnail })
    .from(youtubeVideos)
    .innerJoin(youtubeFollows, and(eq(youtubeFollows.channelId, youtubeVideos.channelId), eq(youtubeFollows.userId, userId)))
    .leftJoin(youtubeChannels, eq(youtubeChannels.channelId, youtubeVideos.channelId))
    .where(eq(youtubeVideos.videoId, videoId));
  return row ?? null;
}

/** 觀看頁的標題：只查自己追蹤的頻道的影片，其他影片回 null */
export async function followedVideoTitle(userId: string, videoId: string): Promise<string | null> {
  const [video] = await db()
    .select({ title: youtubeVideos.title })
    .from(youtubeVideos)
    .where(and(eq(youtubeVideos.videoId, videoId), inArray(youtubeVideos.channelId, followedChannelIds(userId))));
  return video?.title ?? null;
}

/** 開始翻譯時存進翻譯紀錄的標題：任何人追蹤的頻道推送過的影片都有，其他影片回 null（翻譯是共用的，標題也是公開資訊） */
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
    // 同一個頻道大家共用一列與一個 WebSub 訂閱；鎖住這一列到交易結束，最後一位追蹤者同時取消追蹤時不會把它刪掉
    const insert = () => tx.insert(youtubeChannels).values({ channelId, title, thumbnail }).onConflictDoNothing({ target: youtubeChannels.channelId }).returning();
    let [row] = await insert();
    let created = Boolean(row);
    if (!row) [row] = await tx.select().from(youtubeChannels).where(eq(youtubeChannels.channelId, channelId)).for("update");
    // 等鎖的期間剛好被最後一位追蹤者刪掉了：當成第一次追蹤重新建立
    if (!row) {
      [row] = await insert();
      created = true;
    }
    const [follow] = await tx.insert(youtubeFollows).values({ userId, channelId }).onConflictDoNothing().returning({ channelId: youtubeFollows.channelId });
    return { channel: row, created, followed: Boolean(follow) };
  });
  if (!followed) throw new YoutubeUserError(`已經在追蹤「${title}」了`);

  await backfillVideos(channelId, feed.entries, created);
  // 已經有人追蹤的頻道沿用原本的訂閱；本機沒有公開 HTTPS 時 hub 會拒絕，仍保留頻道，之後排程 renew 會再試
  return created ? subscribe(channel) : channel;
}

/** 追蹤時從 RSS feed 補進最近的影片、不發通知，新追蹤的人馬上看得到；已經有人追蹤的頻道，24 小時內的影片交給 WebSub 推送（已經收過，或推送還在路上、會照常通知所有追蹤者）。Shorts 不列進清單 */
async function backfillVideos(channelId: string, entries: FeedEntry[], newChannel: boolean): Promise<void> {
  const cutoff = Date.now() - NOTIFY_WINDOW_MS;
  const videos = entries
    .filter((entry) => entry.channelId === channelId && !entry.isShort && entry.published && (newChannel || entry.published.getTime() < cutoff))
    .map((entry) => ({ videoId: entry.videoId, channelId, title: entry.title, publishedAt: entry.published }));
  if (videos.length === 0) return;
  await db().insert(youtubeVideos).values(videos).onConflictDoNothing({ target: youtubeVideos.videoId });
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

/** 只刪自己的追蹤；最後一位追蹤者取消時才刪頻道並取消 WebSub 訂閱。不是自己追蹤的頻道沒有效果 */
export async function removeChannel(userId: string, id: number): Promise<{ warning?: string }> {
  const orphan = await db().transaction(async (tx) => {
    // 鎖住頻道：同時有人加追蹤時，等這裡決定刪不刪之後才繼續
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

/** 頻道已經先從資料庫刪除，hub 立刻回呼確認時才會通過；取消失敗留下的訂閱推送會因頻道不在追蹤中被忽略、租約到期後失效 */
async function unsubscribe(channel: YoutubeChannel): Promise<boolean> {
  try {
    await hubRequest("unsubscribe", channel.channelId);
    return true;
  } catch (error) {
    logError("youtube", "取消訂閱失敗", error, channel.channelId);
    return false;
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

/** 新影片照樣記錄（影片清單要用）；通知只送給追蹤這個頻道、而且通知開著的人。Shorts 不記錄也不通知 */
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
        // 推送的連結常常看不出是不是 Shorts，這裡再請求確認；是的話刪掉，不檢查字幕、不通知
        if (await confirmedShort(entry.videoId)) {
          await db().delete(youtubeVideos).where(eq(youtubeVideos.id, inserted.id));
          // 影片 id 是公開的，留下來才查得到推送的影片為什麼沒出現在清單上
          console.info("[youtube] 確認是 Shorts，刪除推送的影片", entry.videoId);
          return;
        }
        // 沒有人要收通知的頻道也檢查：影片清單要顯示有沒有中文字幕
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
        // 延後的工作寫了字幕狀態與通知時間；通知本身由 notify() 讓通知的 tag 失效
        expireTags(youtubeTags.videos);
      }
    };
    if (defer) defer(announce);
    else await announce();
  }
  if (recorded > 0) expireTags(youtubeTags.videos);
}

/** 檢查完字幕才讀追蹤者：這段時間裡改的通知開關也算數 */
async function notifiedFollowers(channelId: string): Promise<string[]> {
  const rows = await db()
    .select({ userId: youtubeFollows.userId })
    .from(youtubeFollows)
    .where(and(eq(youtubeFollows.channelId, channelId), eq(youtubeFollows.notifyEnabled, true)));
  return rows.map((row) => row.userId);
}

/** 確認不了（被擋、出錯）就當一般影片：寧可多列一支 Shorts，也不要漏掉一般影片的通知 */
async function confirmedShort(videoId: string): Promise<boolean> {
  try {
    return (await checkIsShort(videoId)) === true;
  } catch (error) {
    logError("youtube", "確認是不是 Shorts 失敗", error);
    return false;
  }
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

/** 每個人只看最新 LIST_LIMIT 支：不在任何人清單裡、發布超過 KEEP_RECENT_MS 的影片刪掉；翻譯是花錢翻好的，永久保留，不跟著影片刪 */
export async function cleanupVideos(now = new Date()): Promise<string> {
  // 確認是 Shorts、但這次先留著的影片（已經通知過、發布不到 KEEP_RECENT_MS）：還在資料表裡，不排除的話會佔掉一般影片的名次
  const keptShorts = new Set<string>();
  // 先刪 Shorts 再排名次，一般影片才不會被 Shorts 擠出最新 LIST_LIMIT 支；這一步出錯或超過時間都不能擋住後面的刪除
  const shorts = await removeStoredShorts(now, keptShorts).catch((error: unknown) => {
    logError("youtube", "清理 Shorts 失敗", error);
    return null;
  });

  const deleted = await db()
    .delete(youtubeVideos)
    .where(and(publishedBefore(recentCutoff(now)), notInArray(youtubeVideos.id, allListedVideoIds([...keptShorts]))))
    .returning({ id: youtubeVideos.id });
  const summary = [`刪除 ${deleted.length} 支不在任何人最新 ${LIST_LIMIT} 支裡的影片`];
  if (!shorts) summary.push("Shorts 檢查失敗（詳見伺服器 log）");
  else {
    if (shorts.removed) summary.push(`刪除 ${shorts.removed} 支 Shorts`);
    if (shorts.skipped) summary.push(`略過 ${shorts.skipped} 個頻道的 Shorts 檢查（超過時間，明天再試）`);
    if (shorts.unconfirmed) summary.push(`還有 ${shorts.unconfirmed} 支影片沒確認是不是 Shorts（明天再試）`);
  }
  return summary.join("；");
}

/** 推送時沒確認到、或這個規則之前就存進來的 Shorts：每個有人追蹤的頻道讀一次 RSS，連結是 /shorts/ 的刪掉；RSS 只有最新十幾支，認不出來、還在某人清單上的再逐支確認 */
async function removeStoredShorts(now: Date, kept: Set<string>): Promise<{ removed: number; skipped: number; unconfirmed: number }> {
  const deadline = Date.now() + SHORTS_SWEEP_BUDGET_MS;
  const followed = await db().selectDistinct({ channelId: youtubeFollows.channelId }).from(youtubeFollows);
  // RSS 裡出現過的影片（一般影片與 Shorts 都算）：連結已經看得出是不是 Shorts，不必再逐支確認
  const known = new Set<string>();
  let removed = 0;
  const skipped = await eachBefore(deadline, followed.map((row) => row.channelId), async (channelId) => {
    removed += await removeChannelShorts(channelId, now, known, kept);
  });
  const listed = await removeListedShorts(now, deadline, known, kept);
  return { removed: removed + listed.removed, skipped, unconfirmed: listed.unconfirmed };
}

/** 同時最多跑 SHORTS_SWEEP_CONCURRENCY 個；過了 deadline 就不再開始新的（已經送出的請求各自最多等 SHORTS_REQUEST_TIMEOUT_MS），回傳沒輪到的數量 */
async function eachBefore<T>(deadline: number, items: T[], task: (item: T) => Promise<void>): Promise<number> {
  const queue = [...items];
  let skipped = 0;
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      if (Date.now() > deadline) {
        skipped += 1 + queue.splice(0).length;
        return;
      }
      await task(item);
    }
  };
  // 一個出錯也等每個 worker 都停下來才丟出：還有工作在刪 Shorts 時就往下算最新 LIST_LIMIT 支會算錯
  const results = await Promise.allSettled(Array.from({ length: Math.min(SHORTS_SWEEP_CONCURRENCY, queue.length) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return skipped;
}

/** 確認是 Shorts 卻沒刪掉的記進 kept：先留著的（已經通知過、發布不到 KEEP_RECENT_MS），或 RSS 裡有、根本沒存進來的（排除了也沒影響） */
function rememberKept(shortIds: string[], deleted: { videoId: string }[], kept: Set<string>): void {
  const gone = new Set(deleted.map((row) => row.videoId));
  for (const videoId of shortIds) if (!gone.has(videoId)) kept.add(videoId);
}

/** 讀一個頻道的 RSS，刪掉連結是 /shorts/ 的影片；RSS 裡出現過的影片記進 known */
async function removeChannelShorts(channelId: string, now: Date, known: Set<string>, kept: Set<string>): Promise<number> {
  // 一個頻道讀不到不影響其他頻道，明天的排程會再試
  const feed = await fetchChannelFeed(channelId, { timeoutMs: SHORTS_REQUEST_TIMEOUT_MS }).catch((error: unknown) => {
    logError("youtube", "清理 Shorts 時讀不到頻道的 RSS", error, channelId);
    return null;
  });
  const entries = (feed?.entries ?? []).filter((entry) => entry.channelId === channelId);
  for (const entry of entries) known.add(entry.videoId);
  const shortIds = entries.filter((entry) => entry.isShort).map((entry) => entry.videoId);
  if (shortIds.length === 0) return 0;
  const deleted = await db()
    .delete(youtubeVideos)
    .where(and(eq(youtubeVideos.channelId, channelId), inArray(youtubeVideos.videoId, shortIds), removableShort(now)))
    .returning({ videoId: youtubeVideos.videoId });
  rememberKept(shortIds, deleted, kept);
  return deleted.length;
}

/** 還在某人最新 LIST_LIMIT 支裡、RSS 認不出來的影片（上線前存進來的、推送時確認不了的）逐支請求 /shorts/ 確認，新的先、每次最多 SHORTS_CHECK_LIMIT 支；刪掉（或確認後先留著）Shorts 後往前補進清單的影片也一起確認 */
async function removeListedShorts(now: Date, deadline: number, known: Set<string>, kept: Set<string>): Promise<{ removed: number; unconfirmed: number }> {
  let removed = 0;
  let unconfirmed = 0;
  let budget = SHORTS_CHECK_LIMIT;
  for (;;) {
    const listed = await db()
      .select({ videoId: youtubeVideos.videoId })
      .from(youtubeVideos)
      .where(inArray(youtubeVideos.id, allListedVideoIds([...kept])))
      .orderBy(...newestFirst);
    const pending = listed.map((row) => row.videoId).filter((videoId) => !known.has(videoId));
    // 超過時間或上限而沒輪到的，跟確認不了的一起寫進摘要，明天再試
    if (pending.length === 0 || budget === 0 || Date.now() > deadline) return { removed, unconfirmed: unconfirmed + pending.length };
    const batch = pending.slice(0, budget);
    budget -= batch.length;
    const shorts: string[] = [];
    await eachBefore(deadline, batch, async (videoId) => {
      // 確認不了（被擋、出錯）就當一般影片留著，跟推送時一樣寧可多留一支 Shorts
      const answer = await checkIsShort(videoId, { timeoutMs: SHORTS_REQUEST_TIMEOUT_MS }).catch((error: unknown) => {
        logError("youtube", "清理時確認是不是 Shorts 失敗", error, videoId);
        return null;
      });
      known.add(videoId);
      if (answer === null) unconfirmed++;
      else if (answer) shorts.push(videoId);
    });
    if (shorts.length === 0) continue;
    const deleted = await db()
      .delete(youtubeVideos)
      .where(and(inArray(youtubeVideos.videoId, shorts), removableShort(now)))
      .returning({ videoId: youtubeVideos.videoId });
    rememberKept(shorts, deleted, kept);
    removed += deleted.length;
  }
}

/** 租約快到期、沒有租約（hub 還沒確認）或失敗的頻道重新訂閱；沒有人追蹤的頻道（例如最後一位追蹤者刪除了帳號）取消訂閱並刪除 */
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
    if (updated.subscriptionStatus?.startsWith("訂閱失敗")) failed++;
  }
  let removed = 0;
  for (const { channel } of channels.filter((c) => c.followers === 0)) {
    if (await removeUnfollowed(channel)) removed++;
  }
  return `${followed.length} 個頻道，續訂 ${due.length} 個${failed ? `（${failed} 個失敗）` : ""}${removed ? `；刪除 ${removed} 個沒有人追蹤的頻道` : ""}`;
}

/** 使用者按「續訂」：處理的是全站共用的訂閱（誰按都一樣），但回應只說他自己追蹤的頻道，不透露全站有多少頻道 */
export async function renewSubscriptionsFor(userId: string, now = new Date()): Promise<string> {
  const wait = await takeCooldown("youtube:renew", userId, MANUAL_RENEW_COOLDOWN_MS, now);
  if (wait > 0) throw new YoutubeUserError(`剛剛才續訂過，請 ${wait} 秒後再試`);
  await renewSubscriptions();
  const mine = await listFollowedChannels(userId);
  if (mine.length === 0) return "已檢查。你還沒有追蹤任何頻道";
  const failed = mine.filter((channel) => channel.subscriptionStatus?.startsWith("訂閱失敗")).length;
  return `已檢查你追蹤的 ${mine.length} 個頻道的訂閱${failed ? `，${failed} 個失敗（打開頻道的選單可以看原因）` : ""}`;
}

/** 刪除前在交易裡再確認一次沒有人追蹤：剛好有人在這時候加追蹤就留著 */
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
