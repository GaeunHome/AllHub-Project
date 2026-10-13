import Link from "next/link";
import { formatRelativeTime, formatTaipeiDateTime } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { watchPagePath, youtubeWatchUrl } from "../../lib/urls";
import type { SavedVideo } from "../../service/saved-videos";
import { removeSavedVideoAction } from "../actions";
import { savedBadge } from "../video-filter";
import { ThumbnailImage } from "./video-card";

/** 清單頁的影片卡片：縮圖（角落是翻譯狀態）、標題、頻道、怎麼加進來的與時間；移除收在 ⋮ 選單（照 YouTube 的「稍後觀看」）。eager：第一排的縮圖不延遲載入 */
export function SavedVideoCard({ video, now, eager }: { video: SavedVideo; now: Date; eager: boolean }) {
  const title = video.title ?? video.videoId;
  const badge = savedBadge(video.translationStatus);
  const href = watchPagePath(video.videoId);

  return (
    <article className="yt-card flex flex-col gap-3">
      {/* 縮圖跟標題連到同一個地方，報讀器只念標題那一個；手機上縮圖撐滿螢幕寬度，跟列表頁一樣 */}
      <Link href={href} tabIndex={-1} aria-hidden className="yt-thumb -mx-4 rounded-none sm:mx-0 sm:rounded-xl">
        <ThumbnailImage videoId={video.videoId} eager={eager} />
        <span className={badge.tone === "danger" ? "yt-badge yt-badge-danger" : "yt-badge"}>{badge.label}</span>
      </Link>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-base leading-snug font-semibold">
            <Link href={href} className="line-clamp-2 break-words text-ink">
              {title}
            </Link>
          </h3>
          {video.channelTitle && <p className="truncate text-sm text-muted">{video.channelTitle}</p>}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
            {/* 自動加入的在清單滿了時會先被擠掉，所以標出是怎麼加進來的 */}
            <span className="chip">
              <Icon name={video.pinned ? "bookmark" : "languages"} className="size-3.5" />
              {video.pinned ? "手動保留" : "翻譯過"}
            </span>
            <time dateTime={video.savedAt.toISOString()} title={formatTaipeiDateTime(video.savedAt)}>
              {formatRelativeTime(video.savedAt, now)}
            </time>
          </p>
        </div>
        {/* 負邊距讓圖示對齊標題的第一行與卡片右緣，按鈕本身仍是完整的正方形 */}
        <MoreMenu label={`「${title}」的選項`} triggerClassName="icon-button yt-card-more -mt-2 -mr-2">
          <a href={youtubeWatchUrl(video.videoId)} target="_blank" rel="noreferrer" className="menu-item">
            <Icon name="external-link" className="size-4" />
            在 YouTube 開啟
          </a>
          <ActionButton
            action={removeSavedVideoAction}
            fields={{ videoId: video.videoId }}
            confirmMessage={`從已保留的影片移除「${title}」？翻譯好的字幕會留著，之後打開同一支影片還看得到。`}
            formClassName="flex flex-col gap-1"
            pendingLabel={
              <>
                <Icon name="trash-2" className="size-4" />
                移除中…
              </>
            }
            className="menu-item menu-item-danger"
          >
            <Icon name="trash-2" className="size-4" />
            從清單移除
          </ActionButton>
        </MoreMenu>
      </div>
    </article>
  );
}
