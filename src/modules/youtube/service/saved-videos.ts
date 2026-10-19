import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { logError } from "@/core/errors";
import { VIDEO_ID } from "../lib/parse";
import { youtubeSavedVideos, youtubeTranslations, type TranslationStatus } from "../data/schema";
import { followedVideo } from "./video-list";

/** 每人最多保留幾部 清單頁不分頁 在瀏覽器裡篩選 */
export const SAVED_LIMIT = 15;
export const SAVED_FULL_MESSAGE = `保留的影片已滿 ${SAVED_LIMIT} 部，請先移除一部`;

/** 保留時存下的標題與頻道名稱 影片被清掉或不再追蹤也看得出是哪一支 */
export type VideoSnapshot = { title: string | null; channelTitle: string | null };

// 每個函式的 userId 都是登入者 只讀寫他自己的清單
const ownRow = (userId: string, videoId: string) => and(eq(youtubeSavedVideos.userId, userId), eq(youtubeSavedVideos.videoId, videoId));

/** Server Action 已經先擋過 這裡再確認一次只收 11 碼本身 不解析網址 */
function assertVideoId(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error("影片 ID 格式不正確");
  return videoId;
}

/**
 * 跟觀看頁顯示的同一份 標題先用共用翻譯存的 再用自己追蹤頻道的影片
 * 頻道名稱只從自己追蹤的頻道拿 別人追蹤哪些頻道不能從這裡看出來
 */
async function storedSnapshot(userId: string, videoId: string): Promise<VideoSnapshot> {
  const [[translation], followed] = await Promise.all([
    db().select({ title: youtubeTranslations.title }).from(youtubeTranslations).where(eq(youtubeTranslations.videoId, videoId)),
    followedVideo(userId, videoId),
  ]);
  return { title: translation?.title ?? followed?.title ?? null, channelTitle: followed?.channelTitle ?? null };
}

export type KeepOptions = {
  /** true 是手動保留 false 是按過翻譯時自動加入 */
  pinned: boolean;
  /**
   * 資料庫沒有的標題或頻道名稱向這裡要 Server Action 給觀看頁讀過的 oEmbed 快取
   * 沒給 讀不到或出錯都存 null
   */
  lookup?: () => Promise<VideoSnapshot | null>;
};

/** 快照只是顯示用的 讀不到不能擋住保留 */
async function snapshotOf(userId: string, videoId: string, lookup: KeepOptions["lookup"]): Promise<VideoSnapshot> {
  const stored = await storedSnapshot(userId, videoId);
  if ((stored.title && stored.channelTitle) || !lookup) return stored;
  const outside = await lookup().catch((error: unknown) => {
    logError("youtube", "保留影片時讀不到標題", error);
    return null;
  });
  return { title: stored.title ?? outside?.title ?? null, channelTitle: stored.channelTitle ?? outside?.channelTitle ?? null };
}

/** saved 是新加入或更新了時間 full 是滿了又都是手動保留的 沒有寫入 */
export type KeepResult = "saved" | "full";

/** 已經在清單裡就更新時間 手動保留時改成手動 滿了先擠掉最舊的自動項目 都是手動就不寫 */
export async function keepVideo(userId: string, input: string, { pinned, lookup }: KeepOptions): Promise<KeepResult> {
  const videoId = assertVideoId(input);
  // 可能要向外讀標題 放在交易外面 不要拿著鎖等外部請求
  const snapshot = await snapshotOf(userId, videoId, lookup);

  return db().transaction(async (tx): Promise<KeepResult> => {
    // 鎖住這個使用者再數 同一個人同時保留好幾部時一個一個來
    // 只鎖清單的列擋不住同時新增的列 清單是空的時也沒有列可鎖
    await lockUserRow(tx, userId, "no key update");
    const rows = await tx
      .select({ videoId: youtubeSavedVideos.videoId, pinned: youtubeSavedVideos.pinned })
      .from(youtubeSavedVideos)
      .where(eq(youtubeSavedVideos.userId, userId))
      .orderBy(asc(youtubeSavedVideos.updatedAt), asc(youtubeSavedVideos.createdAt), asc(youtubeSavedVideos.videoId));
    const now = new Date();

    if (rows.some((row) => row.videoId === videoId)) {
      await tx
        .update(youtubeSavedVideos)
        .set({
          updatedAt: now,
          ...(pinned ? { pinned: true } : {}),
          // 這次讀不到的不蓋掉之前存的
          ...(snapshot.title ? { title: snapshot.title } : {}),
          ...(snapshot.channelTitle ? { channelTitle: snapshot.channelTitle } : {}),
        })
        .where(ownRow(userId, videoId));
      return "saved";
    }

    const overflow = rows.length + 1 - SAVED_LIMIT;
    if (overflow > 0) {
      const evicted = rows.filter((row) => !row.pinned).slice(0, overflow);
      if (evicted.length < overflow) return "full";
      await tx.delete(youtubeSavedVideos).where(
        and(
          eq(youtubeSavedVideos.userId, userId),
          inArray(
            youtubeSavedVideos.videoId,
            evicted.map((row) => row.videoId),
          ),
        ),
      );
    }
    await tx.insert(youtubeSavedVideos).values({ userId, videoId, ...snapshot, pinned, createdAt: now, updatedAt: now });
    return "saved";
  });
}

/** 回傳有沒有刪到 只動自己的清單 翻譯是共用的 不跟著刪 */
export async function removeSavedVideo(userId: string, input: string): Promise<boolean> {
  const videoId = assertVideoId(input);
  const deleted = await db().delete(youtubeSavedVideos).where(ownRow(userId, videoId)).returning({ videoId: youtubeSavedVideos.videoId });
  return deleted.length > 0;
}

export type SavedVideo = VideoSnapshot & {
  videoId: string;
  pinned: boolean;
  /** 保留或最後一次按翻譯的時間 */
  savedAt: Date;
  translationStatus: TranslationStatus | null;
};

/** 新的在前 保留時沒讀到標題的用共用翻譯存的補上 */
export async function listSavedVideos(userId: string): Promise<SavedVideo[]> {
  return db()
    .select({
      videoId: youtubeSavedVideos.videoId,
      title: sql<string | null>`coalesce(${youtubeSavedVideos.title}, ${youtubeTranslations.title})`,
      channelTitle: youtubeSavedVideos.channelTitle,
      pinned: youtubeSavedVideos.pinned,
      savedAt: youtubeSavedVideos.updatedAt,
      translationStatus: youtubeTranslations.status,
    })
    .from(youtubeSavedVideos)
    .leftJoin(youtubeTranslations, eq(youtubeTranslations.videoId, youtubeSavedVideos.videoId))
    .where(eq(youtubeSavedVideos.userId, userId))
    .orderBy(desc(youtubeSavedVideos.updatedAt), desc(youtubeSavedVideos.createdAt), asc(youtubeSavedVideos.videoId));
}
