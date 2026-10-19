import Link from "next/link";
import type { ReactNode } from "react";
import { externalAssetUrl } from "@/core/external-url";
import { formatRelativeTime } from "@/core/time";
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

/**
 * 有中文字幕的直接到 YouTube 看 不會在觀看頁按播放時自動翻譯而花錢
 * 其他的到翻譯觀看頁
 */
export function VideoLink({ video, className, children, decorative = false }: VideoLinkProps) {
  // 縮圖跟標題連到同一處 報讀器只念標題那個
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

/**
 * 列表與保留的影片共用 讀不到時顯示影片圖示
 * eager 給畫面最上面一排 常常是 LCP 不延遲載入
 */
export function ThumbnailImage({ videoId, eager }: { videoId: string; eager: boolean }) {
  return (
    <ExternalImage
      src={externalAssetUrl(youtubeThumbnailUrl(videoId))}
      alt=""
      fill
      loading={eager ? "eager" : "lazy"}
      className="object-cover"
      fallback={
        <span className="grid h-full w-full place-items-center text-accent">
          <Icon name="clapperboard" className="size-7" />
        </span>
      }
    />
  );
}

/** 縮圖右下角的狀態標籤像 YouTube 的影片長度 */
export function VideoThumbnail({ video, eager = false }: { video: FeedVideo; eager?: boolean }) {
  const badge = thumbnailBadge(video);
  return (
    <>
      <ThumbnailImage videoId={video.videoId} eager={eager} />
      <span className={badge.tone === "danger" ? "yt-badge yt-badge-danger" : "yt-badge"}>
        {video.zhCaptions === "yes" && <Icon name="captions" className="size-3.5" />}
        {badge.label}
      </span>
    </>
  );
}

export const channelNameOf = (video: FeedVideo) => video.channelTitle ?? "（已刪除的頻道）";

/** 列表頁的影片卡片 版面照 YouTube 動作收在選單裡 */
export function VideoCard({ video, now, eager = false }: { video: FeedVideo; now: Date; eager?: boolean }) {
  const channelName = channelNameOf(video);
  const hasZh = video.zhCaptions === "yes";

  return (
    <article className="yt-card flex flex-col gap-3">
      {/* 手機上縮圖撐滿螢幕寬 跟 YouTube App 一樣 */}
      <VideoLink video={video} decorative className="yt-thumb -mx-4 rounded-none sm:mx-0 sm:rounded-xl">
        <VideoThumbnail video={video} eager={eager} />
      </VideoLink>
      <div className="flex items-start gap-3">
        <ChannelAvatar channelRef={video.channelId} name={channelName} stored={video.channelThumbnail} size="sm" />
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
        {/* 負邊距讓圖示對齊標題第一行與卡片右緣 按鈕本身仍是完整的正方形 */}
        <MoreMenu label={`「${video.title}」的選項`} triggerClassName="icon-button yt-card-more -mt-2 -mr-2">
          {/* 有中文字幕又沒翻譯過的不必翻譯 就不放入口 */}
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
