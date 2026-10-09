import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";

export type VideoFilter = "all" | "zh" | "translate" | "done";

export const VIDEO_FILTERS: readonly { id: VideoFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "zh", label: "有中文字幕" },
  { id: "translate", label: "需要翻譯" },
  { id: "done", label: "翻譯完成" },
];

type VideoState = { zhCaptions: ZhCaptionStatus; translationStatus: TranslationStatus | null };

/** 「需要翻譯」是還看不到中文的影片：沒有中文字幕（或還沒確認），也還沒翻完 */
export function videoFilters({ zhCaptions, translationStatus }: VideoState): VideoFilter[] {
  const filters: VideoFilter[] = ["all"];
  if (zhCaptions === "yes") filters.push("zh");
  if (translationStatus === "done") filters.push("done");
  else if (zhCaptions !== "yes") filters.push("translate");
  return filters;
}

export function countByFilter(videos: VideoState[]): Record<VideoFilter, number> {
  const counts: Record<VideoFilter, number> = { all: 0, zh: 0, translate: 0, done: 0 };
  for (const video of videos) for (const filter of videoFilters(video)) counts[filter] += 1;
  return counts;
}

export type ThumbnailBadge = { label: string; tone: "default" | "danger" };

/** 像 YouTube 縮圖右下角的時間長度標籤：先看能不能直接看中文，再看翻譯進度 */
export function thumbnailBadge({ zhCaptions, translationStatus }: VideoState): ThumbnailBadge {
  if (zhCaptions === "yes") return { label: "中文字幕", tone: "default" };
  switch (translationStatus) {
    case "done":
      return { label: "已翻譯", tone: "default" };
    case "queued":
    case "running":
      return { label: "翻譯中", tone: "default" };
    case "failed":
      return { label: "翻譯失敗", tone: "danger" };
    case null:
      return { label: zhCaptions === "no" ? "需要翻譯" : "字幕未確認", tone: "default" };
  }
}

/** 觀看頁的「接下來播放」：最近的影片去掉正在看的這支 */
export function upNext<T extends { videoId: string }>(videos: T[], current: string, limit = 12): T[] {
  return videos.filter((video) => video.videoId !== current).slice(0, limit);
}

/** 首頁「最新影片」的支數：寬螢幕剛好一排 */
const LATEST_LIMIT = 4;

/** 清單已經是新的在前（發布時間，沒有的排最後），取前幾支；其餘只算數量 */
export function latestVideos<T>(videos: T[], limit = LATEST_LIMIT): { shown: T[]; more: number } {
  return { shown: videos.slice(0, limit), more: Math.max(0, videos.length - limit) };
}
