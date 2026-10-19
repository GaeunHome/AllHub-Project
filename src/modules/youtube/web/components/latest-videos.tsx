import Link from "next/link";
import { formatRelativeTime } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { MEDIA_GRID, MediaGridSkeleton } from "@/core/ui/media-grid";
import { Skeleton } from "@/core/ui/skeleton";
import { YOUTUBE_PAGE_PATH } from "../../lib/urls";
import { ChannelAvatar } from "./channel-avatar";
import { VideoLink, VideoThumbnail, channelNameOf, type FeedVideo } from "./video-card";

/** 首頁最新影片的內容 點擊與狀態標籤跟 YouTube 頁共用 */
export function LatestVideoList({ videos, more, now }: { videos: FeedVideo[]; more: number; now: Date }) {
  if (videos.length === 0) {
    return (
      <EmptyState
        compact
        icon="clapperboard"
        title="還沒有影片"
        action={
          <Link href={YOUTUBE_PAGE_PATH} className="btn-secondary">
            去追蹤頻道
          </Link>
        }
      />
    );
  }

  return (
    <div className="stack">
      <ul className={MEDIA_GRID}>
        {videos.map((video) => (
          <li key={video.videoId} className="min-w-0">
            <LatestVideoTile video={video} now={now} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={YOUTUBE_PAGE_PATH} className="link link-block">
          還有 {more} 支影片
        </Link>
      )}
    </div>
  );
}

function LatestVideoTile({ video, now }: { video: FeedVideo; now: Date }) {
  const channelName = channelNameOf(video);
  return (
    <article className="flex items-start gap-3 @md:flex-col @md:items-stretch">
      {/* 首頁最多 4 支 寬的時候剛好是卡片第一排 常常是 LCP */}
      <VideoLink video={video} decorative className="yt-thumb w-32 shrink-0 rounded-lg @md:w-full">
        <VideoThumbnail video={video} eager />
      </VideoLink>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="leading-snug font-semibold">
          <VideoLink video={video} className="line-clamp-2 text-ink hover:text-brand-ink">
            {video.title}
          </VideoLink>
        </h3>
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
          <ChannelAvatar channelRef={video.channelId} name={channelName} stored={video.channelThumbnail} size="xs" />
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
    <MediaGridSkeleton label="載入最新影片…">
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    </MediaGridSkeleton>
  );
}
