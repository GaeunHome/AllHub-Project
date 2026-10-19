import "server-only";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { HOUR_MS } from "@/core/time";
import { checkIsShort, fetchChannelFeed } from "../lib/api";
import { youtubeFollows, youtubeVideos } from "../data/schema";
import { LIST_LIMIT, allListedVideoIds, newestFirst } from "./video-list";

// 每天的 youtube:cleanup 排程 清掉 Shorts 與不在任何人清單裡的舊影片

/** 發布兩天內的影片不在清單裡也先留著 hub 在 24 小時內重送時才找得到 不會重複通知 */
const KEEP_RECENT_MS = 48 * HOUR_MS;
/** 清理 Shorts 時同時讀幾個頻道的 RSS 與確認幾支影片 */
const SHORTS_SWEEP_CONCURRENCY = 4;
/**
 * 清理 Shorts 的總時間 頻道多又慢時剩下的明天再試
 * 排程才不會拖到被平台中斷 來不及做後面的刪除
 */
const SHORTS_SWEEP_BUDGET_MS = 60_000;
/** RSS 與逐支確認只是用來找 Shorts 慢的不值得等滿 15 秒 跟頻道頭像一樣 5 秒 */
const SHORTS_REQUEST_TIMEOUT_MS = 5_000;
/** RSS 認不出的一般影片每天都會再問一次 有上限才不會對 YouTube 發太多請求 */
const SHORTS_CHECK_LIMIT = 50;
const recentCutoff = (now: Date) => new Date(now.getTime() - KEEP_RECENT_MS);
/**
 * 沒有發布時間的用寫入時間 Date 要自己轉成字串
 * drizzle 只在跟欄位比較時才轉 正式環境的 postgres-js 收到 Date 會丟錯
 */
const publishedBefore = (cutoff: Date) => sql`coalesce(${youtubeVideos.publishedAt}, ${youtubeVideos.createdAt}) < ${cutoff.toISOString()}::timestamptz`;
/**
 * 已經通知過又發布不久的 Shorts 先留著 推送時沒認出是 Shorts 而通知了
 * hub 在 24 小時內重送時要找得到這一列 才不會再通知一次
 */
const removableShort = (now: Date) => or(isNull(youtubeVideos.notifiedAt), publishedBefore(recentCutoff(now)));

/**
 * 不在任何人清單裡又發布超過兩天的影片刪掉
 * 翻譯是花錢翻好的 永久保留 不跟著影片刪
 */
export async function cleanupVideos(now = new Date()): Promise<string> {
  // 確認是 Shorts 但這次先留著的影片還在資料表裡
  // 不排除的話會佔掉一般影片的名次
  const keptShorts = new Set<string>();
  // 先刪 Shorts 再排名次 一般影片才不會被擠出清單
  // 這一步出錯或超過時間都不能擋住後面的刪除
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

/**
 * 推送時沒認出或更早存進來的 Shorts 每個有人追蹤的頻道讀一次 RSS 來刪
 * RSS 只有最新十幾支 認不出又還在某人清單上的再逐支確認
 */
async function removeStoredShorts(now: Date, kept: Set<string>): Promise<{ removed: number; skipped: number; unconfirmed: number }> {
  const deadline = Date.now() + SHORTS_SWEEP_BUDGET_MS;
  const followed = await db().selectDistinct({ channelId: youtubeFollows.channelId }).from(youtubeFollows);
  // RSS 裡出現過的影片從連結就看得出是不是 Shorts 不必再逐支確認
  const known = new Set<string>();
  let removed = 0;
  const skipped = await eachBefore(deadline, followed.map((row) => row.channelId), async (channelId) => {
    removed += await removeChannelShorts(channelId, now, known, kept);
  });
  const listed = await removeListedShorts(now, deadline, known, kept);
  return { removed: removed + listed.removed, skipped, unconfirmed: listed.unconfirmed };
}

/** 並行數有限 過了 deadline 就不開始新的 已送出的各自有逾時 回傳沒輪到的數量 */
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
  // 一個出錯也等每個 worker 都停下來才丟出
  // 還有工作在刪 Shorts 時就往下算名次會算錯
  const results = await Promise.allSettled(Array.from({ length: Math.min(SHORTS_SWEEP_CONCURRENCY, queue.length) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return skipped;
}

/**
 * 確認是 Shorts 卻沒刪掉的記進 kept 包括先留著的
 * 與 RSS 裡有但根本沒存進來的 排除了也沒影響
 */
function rememberKept(shortIds: string[], deleted: { videoId: string }[], kept: Set<string>): void {
  const gone = new Set(deleted.map((row) => row.videoId));
  for (const videoId of shortIds) if (!gone.has(videoId)) kept.add(videoId);
}

/** 刪掉 RSS 連結是 /shorts/ 的影片 RSS 裡出現過的記進 known */
async function removeChannelShorts(channelId: string, now: Date, known: Set<string>, kept: Set<string>): Promise<number> {
  // 一個頻道讀不到不影響其他頻道 明天的排程會再試
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

/**
 * 還在某人清單裡但 RSS 認不出來的影片 新的先逐支確認 每次有上限
 * 刪掉或先留著 Shorts 後往前補進清單的影片也一起確認
 */
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
    // 超過時間或上限而沒輪到的 跟確認不了的一起寫進摘要 明天再試
    if (pending.length === 0 || budget === 0 || Date.now() > deadline) return { removed, unconfirmed: unconfirmed + pending.length };
    const batch = pending.slice(0, budget);
    budget -= batch.length;
    const shorts: string[] = [];
    await eachBefore(deadline, batch, async (videoId) => {
      // 被擋或出錯就當一般影片留著 跟推送時一樣寧可多留一支 Shorts
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
