import type { TranslationStatus } from "../data/schema";

export type VideoFilter = "all" | "done";

export const VIDEO_FILTERS: readonly { id: VideoFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "done", label: "翻譯完成" },
];

type VideoState = { translationStatus: TranslationStatus | null };

export function videoFilters({ translationStatus }: VideoState): VideoFilter[] {
  return translationStatus === "done" ? ["all", "done"] : ["all"];
}

export type ThumbnailBadge = { label: string; tone: "default" | "danger" };

/** 還沒有翻譯時回 null 由呼叫端決定要怎麼說 */
function translationBadge(status: TranslationStatus | null): ThumbnailBadge | null {
  switch (status) {
    case "done":
      return { label: "已翻譯", tone: "default" };
    case "queued":
    case "running":
      return { label: "翻譯中", tone: "default" };
    case "failed":
      return { label: "翻譯失敗", tone: "danger" };
    case null:
      return null;
  }
}

/** 像 YouTube 縮圖右下角的時間標籤 還沒翻譯的不標 */
export const thumbnailBadge = ({ translationStatus }: VideoState): ThumbnailBadge | null => translationBadge(translationStatus);

/** 已保留的影片多半是想翻譯的 還沒翻譯也寫出來 */
export function savedBadge(status: TranslationStatus | null): ThumbnailBadge {
  return translationBadge(status) ?? { label: "還沒翻譯", tone: "default" };
}

/** 觀看頁的接下來播放 最近的影片去掉正在看的這支 */
export function upNext<T extends { videoId: string }>(videos: T[], current: string, limit = 12): T[] {
  return videos.filter((video) => video.videoId !== current).slice(0, limit);
}

/** 首頁最新影片的支數 寬螢幕剛好一排 */
const LATEST_LIMIT = 4;

/** 清單已經是新的在前 取前幾支 其餘只算數量 */
export function latestVideos<T>(videos: T[], limit = LATEST_LIMIT): { shown: T[]; more: number } {
  return { shown: videos.slice(0, limit), more: Math.max(0, videos.length - limit) };
}
