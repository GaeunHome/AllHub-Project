import "server-only";
import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { hasChineseCaptions, listCaptionTracks } from "../lib/subtitles/captions";
import { youtubeFollows, youtubeVideos, type ZhCaptionStatus } from "../data/schema";
import { youtubeTags } from "./cache-tags";
import { listedVideoIds, newestFirst } from "./video-list";

/**
 * 很多頻道上片後才補字幕 發布兩天內還沒有中文的影片 每小時重新檢查
 * 從沒檢查過的 例如追蹤時從 RSS 補的舊影片 不論多久都先檢查一次
 */
const RECHECK_WINDOW_MS = 48 * 3600_000;
const RECHECK_INTERVAL_MS = 3600_000;
/**
 * 檢查過但讀不到的多半是被擋 不論發布多久隔一天再試
 * 不會永遠停在字幕未確認 也不會一直打 YouTube
 */
const UNKNOWN_RETRY_MS = 24 * 3600_000;
// 一次發太多請求會被 YouTube 擋 所以每次有上限
export const RECHECK_BATCH = 5;
/**
 * 最久沒檢查的先 從沒檢查過的排最前 同一組裡新的先
 * 剛發布的影片每小時到期 才不會一直把從沒檢查過的舊影片擠掉
 */
const longestUncheckedFirst = [sql`${youtubeVideos.zhCaptionsCheckedAt} asc nulls first`, ...newestFirst];

// 手動重新檢查只處理登入者追蹤的頻道 影片是共用的 結果所有追蹤者都看得到
const followedBy = (userId: string) =>
  inArray(youtubeVideos.channelId, db().select({ channelId: youtubeFollows.channelId }).from(youtubeFollows).where(eq(youtubeFollows.userId, userId)));

/**
 * 寫回檢查結果並回傳目前狀態 影片已經被清掉回 null
 * 推送 手動與背景的重新檢查共用 不分使用者
 */
export async function checkChineseCaptions(videoId: string, now = new Date()): Promise<ZhCaptionStatus | null> {
  const result = await listCaptionTracks(videoId);
  // 這次抓不到多半是被擋 不代表字幕變了 保留之前的結果 只更新檢查時間
  const values = result.ok ? { zhCaptions: hasChineseCaptions(result.tracks) ? ("yes" as const) : ("no" as const), zhCaptionsCheckedAt: now } : { zhCaptionsCheckedAt: now };
  const [row] = await db().update(youtubeVideos).set(values).where(eq(youtubeVideos.videoId, videoId)).returning({ zhCaptions: youtubeVideos.zhCaptions });
  return row?.zhCaptions ?? null;
}

/**
 * 影片清單的重新檢查中文字幕 只能檢查自己追蹤頻道的影片
 * 別人的當作不在清單裡 回 null 也不對 YouTube 發請求
 */
export async function checkFollowedVideoCaptions(userId: string, videoId: string, now = new Date()): Promise<ZhCaptionStatus | null> {
  const [video] = await db().select({ id: youtubeVideos.id }).from(youtubeVideos).where(and(eq(youtubeVideos.videoId, videoId), followedBy(userId)));
  return video ? checkChineseCaptions(videoId, now) : null;
}

export type RecheckCandidate = { videoId: string; publishedAt: Date | null; zhCaptions: ZhCaptionStatus; zhCaptionsCheckedAt: Date | null };

/**
 * 自己清單上還沒有中文字幕的影片 不在 SQL 裡比時間 結果才能快取到下次寫入
 * 到期與否交給 isRecheckDue 用當下時間判斷
 */
export async function recheckCandidates(userId: string): Promise<RecheckCandidate[]> {
  return db()
    .select({ videoId: youtubeVideos.videoId, publishedAt: youtubeVideos.publishedAt, zhCaptions: youtubeVideos.zhCaptions, zhCaptionsCheckedAt: youtubeVideos.zhCaptionsCheckedAt })
    .from(youtubeVideos)
    .where(and(ne(youtubeVideos.zhCaptions, "yes"), inArray(youtubeVideos.id, listedVideoIds(userId))));
}

/** 條件跟 recheckDueCaptions 相同 頁面先用快取判斷 沒有到期就不必在背景碰資料庫 */
export function isRecheckDue({ publishedAt, zhCaptions, zhCaptionsCheckedAt }: RecheckCandidate, now = new Date()): boolean {
  if (zhCaptions === "yes") return false;
  if (!zhCaptionsCheckedAt) return true;
  const checkedAgo = now.getTime() - zhCaptionsCheckedAt.getTime();
  if (zhCaptions === "unknown" && checkedAgo > UNKNOWN_RETRY_MS) return true;
  if (!publishedAt || publishedAt.getTime() < now.getTime() - RECHECK_WINDOW_MS) return false;
  return checkedAgo > RECHECK_INTERVAL_MS;
}

/**
 * 只檢查這個人清單上的影片 回傳檢查了幾支
 * 先把檢查時間改成現在當作認領 同時觸發好幾次也不會重複檢查
 */
export async function recheckDueCaptions(userId: string, now = new Date()): Promise<number> {
  const before = (ms: number) => new Date(now.getTime() - ms);
  const due = and(
    inArray(youtubeVideos.id, listedVideoIds(userId)),
    ne(youtubeVideos.zhCaptions, "yes"),
    or(
      isNull(youtubeVideos.zhCaptionsCheckedAt),
      and(eq(youtubeVideos.zhCaptions, "unknown"), lt(youtubeVideos.zhCaptionsCheckedAt, before(UNKNOWN_RETRY_MS))),
      and(gte(youtubeVideos.publishedAt, before(RECHECK_WINDOW_MS)), lt(youtubeVideos.zhCaptionsCheckedAt, before(RECHECK_INTERVAL_MS))),
    ),
  );
  const candidates = await db()
    .select({ id: youtubeVideos.id, videoId: youtubeVideos.videoId })
    .from(youtubeVideos)
    .where(due)
    .orderBy(...longestUncheckedFirst)
    .limit(RECHECK_BATCH);
  if (candidates.length === 0) return 0;
  // 認領時再比一次條件 被別的請求先認領的列 等鎖放開後重新判斷就不符合了
  const claimed = await db()
    .update(youtubeVideos)
    .set({ zhCaptionsCheckedAt: now })
    .where(and(inArray(youtubeVideos.id, candidates.map((c) => c.id)), due))
    .returning({ id: youtubeVideos.id });
  const claimedIds = new Set(claimed.map((row) => row.id));
  // 照認領前排好的順序檢查 UPDATE RETURNING 不保證順序
  // 背景工作被中斷時 排在前面的已經檢查過
  const mine = candidates.filter((c) => claimedIds.has(c.id));

  for (const { videoId } of mine) {
    try {
      await checkChineseCaptions(videoId, now);
    } catch (error) {
      logError("youtube", "重新檢查中文字幕失敗", error);
    }
  }
  // 只在頁面的 after 裡執行 不是 Server Action
  if (mine.length > 0) expireTags(youtubeTags.videos);
  return mine.length;
}
