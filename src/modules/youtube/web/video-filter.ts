import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";

export type VideoFilter = "all" | "zh" | "translate" | "done";

export const VIDEO_FILTERS: readonly { id: VideoFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "zh", label: "有中文字幕" },
  { id: "translate", label: "需要翻譯" },
  { id: "done", label: "翻譯完成" },
];

type VideoState = { zhCaptions: ZhCaptionStatus; translationStatus: TranslationStatus | null };

/** 需要翻譯是還看不到中文的影片 沒有或還沒確認中文字幕 也還沒翻完 */
export function videoFilters({ zhCaptions, translationStatus }: VideoState): VideoFilter[] {
  const filters: VideoFilter[] = ["all"];
  if (zhCaptions === "yes") filters.push("zh");
  if (translationStatus === "done") filters.push("done");
  else if (zhCaptions !== "yes") filters.push("translate");
  return filters;
}

type CaptionCheck = { zhCaptions: ZhCaptionStatus; zhCaptionsCheckedAt: Date | null };

/**
 * 從沒檢查過字幕的影片 打開 YouTube 頁時背景就會檢查
 * 跟檢查過但讀不到的字幕未確認分開
 */
export function captionCheckPending({ zhCaptions, zhCaptionsCheckedAt }: CaptionCheck): boolean {
  return zhCaptions === "unknown" && zhCaptionsCheckedAt === null;
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

/** 像 YouTube 縮圖右下角的時間標籤 先看能不能直接看中文 再看翻譯進度 */
export function thumbnailBadge(video: VideoState & CaptionCheck): ThumbnailBadge {
  const { zhCaptions, translationStatus } = video;
  if (zhCaptions === "yes") return { label: "中文字幕", tone: "default" };
  const translation = translationBadge(translationStatus);
  if (translation) return translation;
  if (zhCaptions === "no") return { label: "需要翻譯", tone: "default" };
  return { label: captionCheckPending(video) ? "檢查字幕中" : "字幕未確認", tone: "default" };
}

/** 保留的影片不一定來自追蹤中的頻道 沒檢查中文字幕 只看翻譯進度 */
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
