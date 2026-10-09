import Link from "next/link";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { EmptyState } from "@/core/ui/empty-state";
import { ExternalImage } from "@/core/ui/external-image";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatLiveDuration, formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { TwitchStreamer } from "../../data/schema";

type LiveStreamer = StreamerVisual<TwitchStreamer>;

// 寬螢幕一排四張、平板兩張；手機上改成一列一位（小預覽圖在左），不會一張預覽圖就佔滿整個畫面
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";
// web 層不能讀模組根目錄的 info.ts，模組網址寫在這裡
const TWITCH_PAGE = "/twitch";

/** 首頁「正在直播」的內容；streamers 只有直播中的（最多幾位），其餘的人數放在 more */
export function LiveNowList({ streamers, more, now }: { streamers: LiveStreamer[]; more: number; now: Date }) {
  if (streamers.length === 0) return <EmptyState compact icon="tv" title="目前沒有追蹤的主播在直播" />;

  return (
    <div className="stack">
      <ul className={GRID}>
        {streamers.map((s) => (
          <li key={s.id} className="min-w-0">
            <LiveTile streamer={s} now={now} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={TWITCH_PAGE} className="link link-block">
          還有 {more} 位正在直播
        </Link>
      )}
    </div>
  );
}

export function NoFollowedStreamers() {
  return (
    <EmptyState
      compact
      icon="heart"
      title="還沒有追蹤任何主播"
      action={
        <Link href={TWITCH_PAGE} className="btn-secondary">
          去追蹤主播
        </Link>
      }
    />
  );
}

/** 一位主播一個連結（新分頁開 Twitch）；沒有預覽圖（沒設定憑證、剛開台）時改放頭像，資訊只寫「直播中」 */
function LiveTile({ streamer: s, now }: { streamer: LiveStreamer; now: Date }) {
  const live = s.live;
  const avatar = externalAssetUrl(s.avatarUrl);
  const meta = [formatViewerCount(live?.viewerCount ?? null), formatLiveDuration(live?.startedAt ?? null, now)].filter((text) => text !== null);
  const placeholder = (
    <span className="grid h-full w-full place-items-center bg-accent-soft">
      <Avatar src={avatar} name={s.displayName} size="md" className="ring-2 ring-accent" />
    </span>
  );

  return (
    <a
      href={`https://twitch.tv/${s.login}`}
      target="_blank"
      rel="noreferrer"
      title={live?.title ?? undefined}
      className="group flex items-start gap-3 rounded-xl sm:flex-col sm:items-stretch"
    >
      <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-accent transition-shadow group-hover:ring-2 sm:w-full">
        {live?.previewUrl ? <ExternalImage src={externalAssetUrl(live.previewUrl)} alt="" fill className="object-cover" fallback={placeholder} /> : placeholder}
        <span className="tw-live-badge">LIVE</span>
      </span>
      {/* 頭像對齊第一行（主播名稱），文字有三、四行時也不會飄在中間 */}
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {live?.previewUrl && <Avatar src={avatar} name={s.displayName} size="sm" className="ring-2 ring-accent" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-ink group-hover:text-accent-ink">{s.displayName}</span>
          {live?.gameName && <span className="truncate text-sm text-accent-ink">{live.gameName}</span>}
          {/* 觀看人數與開台多久放不下一行時各佔一行，不截斷 */}
          <span className="flex flex-wrap gap-x-3 text-sm text-ink-soft tabular-nums">
            {meta.length > 0 ? meta.map((text) => <span key={text}>{text}</span>) : "直播中"}
          </span>
        </span>
      </span>
    </a>
  );
}

export function LiveNowSkeleton() {
  return (
    <LoadingState label="載入正在直播的主播…" className={GRID}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex items-start gap-3 sm:flex-col sm:items-stretch ${i > 1 ? "hidden lg:flex" : ""}`}>
          <Skeleton className="aspect-video w-32 shrink-0 rounded-lg sm:w-full" />
          <div className="flex flex-1 items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </LoadingState>
  );
}
