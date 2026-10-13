import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { youtubeFollows, youtubeVideos } from "../data/schema";

/** 每個人的影片清單只看自己追蹤頻道的最新幾支；不在任何人清單裡的影片由排程 cleanup 刪掉 */
export const LIST_LIMIT = 20;
/** 清單、清理與字幕重新檢查用同一個「最新」：發布時間新的在前，沒有發布時間的排最後 */
export const newestFirst = [sql`${youtubeVideos.publishedAt} desc nulls last`, desc(youtubeVideos.id)];

/** 這個人清單上那幾支影片的 id（跟 recentVideos 同一個範圍），當子查詢用：背景重新檢查字幕只碰畫面上看得到的影片 */
export function listedVideoIds(userId: string) {
  return db()
    .select({ id: youtubeVideos.id })
    .from(youtubeVideos)
    .innerJoin(youtubeFollows, and(eq(youtubeFollows.channelId, youtubeVideos.channelId), eq(youtubeFollows.userId, userId)))
    .orderBy(...newestFirst)
    .limit(LIST_LIMIT);
}
