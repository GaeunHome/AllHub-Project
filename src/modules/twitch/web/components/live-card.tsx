import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";
import { formatLiveDuration, formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { TwitchStreamer } from "../../data/schema";

/** 照 Twitch「追蹤中」頁的直播卡：16:9 預覽圖、左上 LIVE、左下觀看人數；沒有預覽圖（沒設定憑證、剛開台）時改放大頭像 */
export function LiveCard({ streamer: s, now }: { streamer: StreamerVisual<TwitchStreamer>; now: Date }) {
  const live = s.live;
  const channelUrl = `https://twitch.tv/${s.login}`;
  const viewers = formatViewerCount(live?.viewerCount ?? null);
  const duration = formatLiveDuration(live?.startedAt ?? null, now);
  const placeholder = (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-linear-to-br from-[#2a1650] via-[#1f1f23] to-[#0e0e10]">
      <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="lg" className="ring-2 ring-brand" />
      <span className="text-sm font-semibold text-ink-soft">直播中</span>
    </span>
  );

  return (
    <article className="tw-card flex min-w-0 flex-col gap-3">
      {/* 文字已經在下面，預覽圖的連結不重複報讀 */}
      <a href={channelUrl} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden className="tw-preview">
        {live?.previewUrl ? <ExternalImage src={externalAssetUrl(live.previewUrl)} alt="" fill className="object-cover" fallback={placeholder} /> : placeholder}
        <span className="tw-live-badge">LIVE</span>
        {viewers && <span className="tw-overlay-chip bottom-2 left-2">{viewers}</span>}
        {duration && <span className="tw-overlay-chip top-2 right-2">{duration}</span>}
      </a>
      <div className="flex min-w-0 items-start gap-3">
        <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="sm" className="ring-2 ring-brand" />
        <div className="min-w-0 flex-1">
          <a href={channelUrl} target="_blank" rel="noreferrer" title={live?.title ?? undefined} className="line-clamp-1 font-semibold text-ink hover:text-brand-ink">
            {live?.title ?? `${s.displayName} 正在直播`}
          </a>
          <p className="truncate text-sm text-ink-soft">{s.displayName}</p>
          {live?.gameName && <p className="truncate text-sm text-brand-ink">{live.gameName}</p>}
        </div>
        {live?.gameName && (
          <ExternalImage
            src={externalAssetUrl(live.boxArtUrl)}
            alt=""
            width={72}
            height={96}
            className="h-12 w-9 shrink-0 rounded bg-surface-muted object-cover"
            fallback={
              <span aria-hidden className="grid h-12 w-9 shrink-0 place-items-center rounded bg-surface-muted text-brand-ink">
                <Icon name="gamepad-2" className="size-4" />
              </span>
            }
          />
        )}
      </div>
    </article>
  );
}
