import "server-only";
import { and, desc, eq, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { youtubeFollows, youtubeVideos } from "../data/schema";

/** 每人的清單只看自己追蹤頻道的最新幾支 不在任何人清單裡的由 cleanup 刪掉 */
export const LIST_LIMIT = 20;
/** 清單 清理與字幕重新檢查用同一種排法 新的在前 沒有發布時間的排最後 */
export const newestFirst = [sql`${youtubeVideos.publishedAt} desc nulls last`, desc(youtubeVideos.id)];

/**
 * 這個人清單上的影片 id 範圍跟 recentVideos 一樣 當子查詢用
 * 背景重新檢查字幕只碰畫面上看得到的影片
 */
export function listedVideoIds(userId: string) {
  return db()
    .select({ id: youtubeVideos.id })
    .from(youtubeVideos)
    .innerJoin(youtubeFollows, and(eq(youtubeFollows.channelId, youtubeVideos.channelId), eq(youtubeFollows.userId, userId)))
    .orderBy(...newestFirst)
    .limit(LIST_LIMIT);
}

/**
 * 所有人清單的聯集 清理時只留這些 也只逐支確認這些是不是 Shorts
 * exceptVideoIds 不算名次 先留著的 Shorts 才不會把一般影片擠出清單而刪掉
 */
export function allListedVideoIds(exceptVideoIds: readonly string[] = []) {
  const ranked = db()
    .select({
      id: youtubeVideos.id,
      rank: sql<number>`row_number() over (partition by ${youtubeFollows.userId} order by ${sql.join(newestFirst, sql`, `)})`.as("rank"),
    })
    .from(youtubeVideos)
    .innerJoin(youtubeFollows, eq(youtubeFollows.channelId, youtubeVideos.channelId))
    .where(exceptVideoIds.length > 0 ? notInArray(youtubeVideos.videoId, [...exceptVideoIds]) : undefined)
    .as("ranked");
  return db().select({ id: ranked.id }).from(ranked).where(lte(ranked.rank, LIST_LIMIT));
}
