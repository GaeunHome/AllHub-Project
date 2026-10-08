import Link from "next/link";
import { after } from "next/server";
import { requireSession } from "@/core/auth";
import { logError } from "@/core/errors";
import { formatTaipeiDateTime } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { watchPagePath, youtubeWatchUrl } from "../../lib/urls";
import type { TranslationStatus } from "../../data/schema";
import { cachedRecentVideos, cachedRecheckCandidates } from "../../service/cached";
import { isRecheckDue, recheckDueCaptions } from "../../service/caption-status";
import { describeTranslationStatus, describeZhCaptions } from "../status";
import { RecheckCaptionsButton } from "./recheck-captions-button";

const ACTION_ICONS: Record<TranslationStatus | "none", UiIconName> = {
  none: "languages",
  queued: "loader-circle",
  running: "loader-circle",
  done: "play",
  failed: "circle-alert",
};

export async function RecentVideos() {
  await requireSession();
  const [videos, candidates] = await Promise.all([cachedRecentVideos(), cachedRecheckCandidates()]);
  // 很多頻道上片後才補字幕：有到期的影片才在背景重新檢查（下次打開就看得到結果），沒有就不碰資料庫
  const now = new Date();
  if (candidates.some((candidate) => isRecheckDue(candidate, now))) {
    after(() => recheckDueCaptions().catch((error: unknown) => logError("youtube", "背景重新檢查中文字幕失敗", error)));
  }

  if (videos.length === 0) {
    return <EmptyState icon="clapperboard" title="還沒收到新影片通知" hint="追蹤的頻道一有新影片，就會出現在這裡" />;
  }

  return (
    <ul className="card divide-y divide-line p-0">
      {videos.map((video) => {
        const status = video.translationStatus;
        const translating = status === "queued" || status === "running";
        const captions = describeZhCaptions(video.zhCaptions);
        const youtubeUrl = youtubeWatchUrl(video.videoId);
        const translateLink = (
          <Link href={watchPagePath(video.videoId)} className={status === "failed" ? "btn-danger btn-sm" : "btn-secondary btn-sm"}>
            <Icon name={ACTION_ICONS[status ?? "none"]} className={translating ? "size-3.5 motion-safe:animate-spin" : "size-3.5"} />
            {describeTranslationStatus(status)}
          </Link>
        );
        return (
          <li key={video.videoId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
            <span className="icon-tile hidden size-10 rounded-xl sm:inline-grid">
              <Icon name="play" />
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <a href={youtubeUrl} target="_blank" rel="noreferrer" className="block truncate font-medium text-ink hover:text-accent-ink hover:underline">
                {video.title}
              </a>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <p className="truncate text-xs text-muted">
                  {video.channelTitle ?? "（已刪除的頻道）"}
                  {video.publishedAt && ` · ${formatTaipeiDateTime(video.publishedAt)}`}
                </p>
                <span className={`${captions.chip} shrink-0`}>
                  <Icon name="captions" className="size-3" />
                  {captions.label}
                </span>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              {video.zhCaptions === "yes" ? (
                <>
                  {/* 已經有翻譯紀錄的話仍保留入口 */}
                  {status !== null && translateLink}
                  <a href={youtubeUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                    <Icon name="external-link" className="size-3.5" />
                    在 YouTube 看
                  </a>
                </>
              ) : (
                <>
                  <RecheckCaptionsButton videoId={video.videoId} />
                  {translateLink}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
