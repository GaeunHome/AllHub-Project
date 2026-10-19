import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { ExternalImage } from "@/core/ui/external-image";
import { twitchChannelUrl } from "../../lib/urls";
import { formatLiveDuration, formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { FollowedStreamer } from "../../data/schema";
import { GameBoxArt } from "./game-box-art";

/**
 * 照 Twitch 追蹤中頁的直播卡 沒有預覽圖時改放大頭像
 * eager 給第一排 預覽圖立刻載入
 */
export function LiveCard({ streamer: s, now, eager = false }: { streamer: StreamerVisual<FollowedStreamer>; now: Date; eager?: boolean }) {
  const live = s.live;
  const channelUrl = twitchChannelUrl(s.login);
  const viewers = formatViewerCount(live?.viewerCount ?? null);
  const duration = formatLiveDuration(live?.startedAt ?? null, now);
  const placeholder = (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-linear-to-br from-[#2a1650] via-[#1f1f23] to-[#0e0e10]">
      <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="lg" className="ring-2 ring-brand" />
      <span className="text-sm font-semibold text-ink-soft">直播中</span>
    </span>
  );

  return (
    // 只有一位在直播時欄寬是整欄 卡片限寬預覽圖才不會被拉得很大
    <article className="tw-card flex min-w-0 max-w-xl flex-col gap-3">
      {/* 文字已經在下面 預覽圖的連結不重複報讀 */}
      <a href={channelUrl} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden className="tw-preview">
        {live?.previewUrl ? <ExternalImage src={externalAssetUrl(live.previewUrl)} alt="" fill loading={eager ? "eager" : "lazy"} className="object-cover" fallback={placeholder} /> : placeholder}
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
        {live?.gameName && <GameBoxArt url={live.boxArtUrl} size="sm" />}
      </div>
    </article>
  );
}
