import Link from "next/link";
import { Suspense } from "react";
import { externalAssetUrl } from "@/core/external-url";
import { formatRelativeTime } from "@/core/time";
import { Avatar } from "@/core/ui/avatar";
import { EmptyState } from "@/core/ui/empty-state";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ChannelAvatar } from "./channel-avatar";
import { VideoLink, VideoThumbnail, channelNameOf, type FeedVideo } from "./video-card";

// 寬螢幕一排四支、平板兩支；手機上一列一支（小縮圖在左），跟 Twitch 的卡片同一套格線
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";
// web 層不能讀模組根目錄的 info.ts，模組網址寫在這裡
const YOUTUBE_PAGE = "/youtube";

/** 首頁「最新影片」的內容；點擊與狀態標籤照 YouTube 頁（VideoLink、VideoThumbnail） */
export function LatestVideoList({ videos, more, now }: { videos: FeedVideo[]; more: number; now: Date }) {
  if (videos.length === 0) {
    return (
      <EmptyState
        compact
        icon="clapperboard"
        title="還沒有影片"
        action={
          <Link href={YOUTUBE_PAGE} className="btn-secondary">
            去追蹤頻道
          </Link>
        }
      />
    );
  }

  return (
    <div className="stack">
      <ul className={GRID}>
        {videos.map((video) => (
          <li key={video.videoId} className="min-w-0">
            <LatestVideoTile video={video} now={now} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={YOUTUBE_PAGE} className="link link-block">
          還有 {more} 支影片
        </Link>
      )}
    </div>
  );
}

function LatestVideoTile({ video, now }: { video: FeedVideo; now: Date }) {
  const channelName = channelNameOf(video);
  return (
    <article className="flex items-start gap-3 sm:flex-col sm:items-stretch">
      <VideoLink video={video} decorative className="yt-thumb w-32 shrink-0 rounded-lg sm:w-full">
        <VideoThumbnail video={video} />
      </VideoLink>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="leading-snug font-semibold">
          <VideoLink video={video} className="line-clamp-2 text-ink hover:text-brand-ink">
            {video.title}
          </VideoLink>
        </h3>
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
          <Suspense fallback={<Avatar src={externalAssetUrl(video.channelThumbnail)} name={channelName} size="xs" />}>
            <ChannelAvatar channelRef={video.channelId} name={channelName} stored={video.channelThumbnail} size="xs" />
          </Suspense>
          <span className="truncate">{channelName}</span>
        </p>
        {video.publishedAt && (
          <p className="text-sm text-ink-soft">
            <time dateTime={video.publishedAt.toISOString()}>{formatRelativeTime(video.publishedAt, now)}</time>
          </p>
        )}
      </div>
    </article>
  );
}

export function LatestVideosSkeleton() {
  return (
    <LoadingState label="載入最新影片…" className={GRID}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex items-start gap-3 sm:flex-col sm:items-stretch ${i > 1 ? "hidden lg:flex" : ""}`}>
          <Skeleton className="aspect-video w-32 shrink-0 rounded-lg sm:w-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}
