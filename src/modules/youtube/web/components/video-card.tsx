import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { externalAssetUrl } from "@/core/external-url";
import { formatRelativeTime } from "@/core/time";
import { Avatar } from "@/core/ui/avatar";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { watchPagePath, youtubeThumbnailUrl, youtubeWatchUrl } from "../../lib/urls";
import type { cachedRecentVideos } from "../../service/cached";
import { describeTranslationStatus } from "../status";
import { thumbnailBadge } from "../video-filter";
import { ChannelAvatar } from "./channel-avatar";
import { RecheckCaptionsButton } from "./recheck-captions-button";

export type FeedVideo = Awaited<ReturnType<typeof cachedRecentVideos>>[number];

type VideoLinkProps = { video: FeedVideo; className?: string; children: ReactNode; decorative?: boolean };

/** 有中文字幕的影片直接到 YouTube 看（不必翻譯，也不會在觀看頁按播放時自動翻譯而花到 API 費用），其他的到翻譯觀看頁 */
export function VideoLink({ video, className, children, decorative = false }: VideoLinkProps) {
  // 縮圖跟標題連到同一個地方，報讀器只念標題那一個
  const hidden = decorative ? ({ tabIndex: -1, "aria-hidden": true } as const) : {};
  if (video.zhCaptions === "yes") {
    return (
      <a href={youtubeWatchUrl(video.videoId)} target="_blank" rel="noreferrer" className={className} {...hidden}>
        {children}
      </a>
    );
  }
  return (
    <Link href={watchPagePath(video.videoId)} className={className} {...hidden}>
      {children}
    </Link>
  );
}

/** 縮圖加右下角的狀態標籤（像 YouTube 的影片長度）；讀不到縮圖時顯示影片圖示 */
export function VideoThumbnail({ video }: { video: FeedVideo }) {
  const badge = thumbnailBadge(video);
  return (
    <>
      <ExternalImage
        src={externalAssetUrl(youtubeThumbnailUrl(video.videoId))}
        alt=""
        fill
        className="object-cover"
        fallback={
          <span className="grid h-full w-full place-items-center text-accent">
            <Icon name="clapperboard" className="size-7" />
          </span>
        }
      />
      <span className={badge.tone === "danger" ? "yt-badge yt-badge-danger" : "yt-badge"}>
        {video.zhCaptions === "yes" && <Icon name="captions" className="size-3.5" />}
        {badge.label}
      </span>
    </>
  );
}

export const channelNameOf = (video: FeedVideo) => video.channelTitle ?? "（已刪除的頻道）";

/** 列表頁的影片卡片：16:9 縮圖，下面是頻道頭像、兩行標題、頻道名稱與「3 小時前」；動作收在 ⋮ 選單 */
export function VideoCard({ video, now }: { video: FeedVideo; now: Date }) {
  const channelName = channelNameOf(video);
  const hasZh = video.zhCaptions === "yes";

  return (
    <article className="yt-card flex flex-col gap-3">
      {/* 手機上縮圖撐滿螢幕寬度，跟 YouTube App 一樣 */}
      <VideoLink video={video} decorative className="yt-thumb -mx-4 rounded-none sm:mx-0 sm:rounded-xl">
        <VideoThumbnail video={video} />
      </VideoLink>
      <div className="flex items-start gap-3">
        <Suspense fallback={<Avatar src={externalAssetUrl(video.channelThumbnail)} name={channelName} size="sm" />}>
          <ChannelAvatar channelRef={video.channelId} name={channelName} stored={video.channelThumbnail} size="sm" />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-base leading-snug font-semibold">
            <VideoLink video={video} className="line-clamp-2 text-ink">
              {video.title}
            </VideoLink>
          </h3>
          <p className="truncate text-sm text-muted">{channelName}</p>
          {video.publishedAt && (
            <p className="text-sm text-muted">
              <time dateTime={video.publishedAt.toISOString()}>{formatRelativeTime(video.publishedAt, now)}</time>
            </p>
          )}
        </div>
        {/* 負邊距讓圖示對齊標題的第一行與卡片右緣，按鈕本身仍是完整的正方形 */}
        <MoreMenu label={`「${video.title}」的選項`} triggerClassName="icon-button yt-card-more -mt-2 -mr-2">
          {/* 有中文字幕又沒翻譯過的影片不必翻譯，就不放入口 */}
          {(!hasZh || video.translationStatus !== null) && (
            <Link href={watchPagePath(video.videoId)} className="menu-item">
              <Icon name="languages" className="size-4" />
              {describeTranslationStatus(video.translationStatus)}
            </Link>
          )}
          <a href={youtubeWatchUrl(video.videoId)} target="_blank" rel="noreferrer" className="menu-item">
            <Icon name="external-link" className="size-4" />
            在 YouTube 開啟
          </a>
          {!hasZh && <RecheckCaptionsButton videoId={video.videoId} />}
        </MoreMenu>
      </div>
    </article>
  );
}
