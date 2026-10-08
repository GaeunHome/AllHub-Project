import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { hasChineseCaptions, listCaptionTracks } from "../lib/subtitles/captions";
import { youtubeVideos, type ZhCaptionStatus } from "../data/schema";
import { youtubeTags } from "./cache-tags";

/** 很多頻道上片後才補字幕：發布兩天內、還沒有中文的影片，清單顯示時重新檢查 */
const RECHECK_WINDOW_MS = 48 * 3600_000;
const RECHECK_INTERVAL_MS = 3600_000;
// 每次最多檢查幾支，避免一次對 YouTube 發太多請求被擋
export const RECHECK_BATCH = 5;

/** 寫回檢查結果並回傳目前狀態；影片不在清單裡回 null */
export async function checkChineseCaptions(videoId: string, now = new Date()): Promise<ZhCaptionStatus | null> {
  const result = await listCaptionTracks(videoId);
  // 這次抓不到（多半是被擋）不代表字幕狀態變了，保留之前確認過的結果，只更新檢查時間
  const values = result.ok ? { zhCaptions: hasChineseCaptions(result.tracks) ? ("yes" as const) : ("no" as const), zhCaptionsCheckedAt: now } : { zhCaptionsCheckedAt: now };
  const [row] = await db().update(youtubeVideos).set(values).where(eq(youtubeVideos.videoId, videoId)).returning({ zhCaptions: youtubeVideos.zhCaptions });
  return row?.zhCaptions ?? null;
}

export type RecheckCandidate = { videoId: string; publishedAt: Date | null; zhCaptionsCheckedAt: Date | null };

/** 還沒有中文字幕的影片；不在 SQL 裡比時間，結果才能快取到下次寫入，到期與否交給 isRecheckDue 用當下時間判斷 */
export async function recheckCandidates(): Promise<RecheckCandidate[]> {
  return db()
    .select({ videoId: youtubeVideos.videoId, publishedAt: youtubeVideos.publishedAt, zhCaptionsCheckedAt: youtubeVideos.zhCaptionsCheckedAt })
    .from(youtubeVideos)
    .where(ne(youtubeVideos.zhCaptions, "yes"));
}

/** 與 recheckDueCaptions 認領的條件相同：頁面先用快取判斷，沒有到期的影片就不必在背景碰資料庫 */
export function isRecheckDue({ publishedAt, zhCaptionsCheckedAt }: RecheckCandidate, now = new Date()): boolean {
  if (!publishedAt || publishedAt.getTime() < now.getTime() - RECHECK_WINDOW_MS) return false;
  return !zhCaptionsCheckedAt || zhCaptionsCheckedAt.getTime() < now.getTime() - RECHECK_INTERVAL_MS;
}

/** 回傳這次檢查了幾支；先把檢查時間改成現在當作認領，同時觸發好幾次也不會重複檢查同一支 */
export async function recheckDueCaptions(now = new Date()): Promise<number> {
  const due = and(
    ne(youtubeVideos.zhCaptions, "yes"),
    gte(youtubeVideos.publishedAt, new Date(now.getTime() - RECHECK_WINDOW_MS)),
    or(isNull(youtubeVideos.zhCaptionsCheckedAt), lt(youtubeVideos.zhCaptionsCheckedAt, new Date(now.getTime() - RECHECK_INTERVAL_MS))),
  );
  const candidates = db().select({ id: youtubeVideos.id }).from(youtubeVideos).where(due).orderBy(desc(youtubeVideos.publishedAt)).limit(RECHECK_BATCH);
  // 外層再比一次條件：另一個請求先認領走的列，等鎖結束後重新判斷就不符合了
  const claimed = await db()
    .update(youtubeVideos)
    .set({ zhCaptionsCheckedAt: now })
    .where(and(inArray(youtubeVideos.id, candidates), due))
    .returning({ videoId: youtubeVideos.videoId });

  for (const { videoId } of claimed) {
    try {
      await checkChineseCaptions(videoId, now);
    } catch (error) {
      logError("youtube", "重新檢查中文字幕失敗", error);
    }
  }
  // 只在頁面的 after() 裡執行，不是 Server Action
  if (claimed.length > 0) expireTags(youtubeTags.videos);
  return claimed.length;
}
