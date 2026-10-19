import { externalAssetUrl } from "@/core/external-url";
import { ActionButton } from "@/core/ui/action-button";
import { Avatar } from "@/core/ui/avatar";
import { DialogButton } from "@/core/ui/dialog";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import { StatusChip } from "@/core/ui/status-chip";
import { twitchChannelUrl } from "../../lib/urls";
import { formatCount, formatLiveDuration, formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { FollowedStreamer } from "../../data/schema";
import { removeStreamerAction, setStreamerNotifyAction } from "../actions";
import { subscriptionBadge } from "../status";
import { GameBoxArt } from "./game-box-art";

/** now 用來算開台多久 同一頁的直播卡片用同一個時間 */
type RowProps = { streamer: StreamerVisual<FollowedStreamer>; now: Date };

/**
 * 照 Twitch 側欄的追蹤清單 直播中顯示遊戲與人數 離線的變灰
 * 點了打開滿版大面板 看預覽 訂閱狀態 通知開關與刪除
 */
export function ChannelRow({ streamer: s, now }: RowProps) {
  const badge = subscriptionBadge(s);
  const viewers = formatCount(s.live?.viewerCount ?? null);
  return (
    <li>
      <DialogButton
        title={s.displayName}
        size="full"
        // 每列一樣高 不論有沒有第二行的遊戲名稱
        // 左右內距加上清單的 p-1.5 跟手機上其他清單一樣離邊框 20px
        buttonClassName="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-3.5 py-2 text-left transition-colors hover:bg-surface-muted"
        label={
          <>
            <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="sm" className={s.isLive ? "" : "opacity-60 grayscale"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate text-sm font-semibold ${s.isLive ? "text-ink" : "text-ink-soft"}`}>{s.displayName}</span>
              {s.isLive && <span className="truncate text-[0.8125rem] text-ink-soft">{s.live?.gameName ?? "直播中"}</span>}
            </span>
            {/* 通知關掉或訂閱有問題時在列上也看得到 */}
            {!s.notifyEnabled && <Icon name="bell-off" label="通知已關閉" className="size-3.5 text-muted" />}
            {badge.tone === "danger" && <Icon name="circle-alert" label={badge.label} className="size-3.5 text-danger" />}
            {s.isLive ? (
              <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] text-ink-soft tabular-nums">
                <span aria-hidden className="size-2 rounded-full bg-live" />
                {viewers ?? "直播中"}
              </span>
            ) : (
              <span className="shrink-0 text-[0.8125rem] text-muted">離線</span>
            )}
            <Icon name="chevron-right" className="size-3.5 shrink-0 text-muted" />
          </>
        }
      >
        <ChannelDetail streamer={s} now={now} />
      </DialogButton>
    </li>
  );
}

/**
 * 視窗的內容 在伺服器算繪好交給 DialogButton
 * 寬螢幕左邊是放大的預覽與直播資訊 右邊是通知 訂閱狀態 連結與刪除
 */
export function ChannelDetail({ streamer: s, now }: RowProps) {
  const badge = subscriptionBadge(s);
  const live = s.live;
  const viewers = formatViewerCount(live?.viewerCount ?? null);
  const duration = formatLiveDuration(live?.startedAt ?? null, now);
  const image = externalAssetUrl(s.isLive ? live?.largePreviewUrl : s.bannerUrl);
  const avatar = externalAssetUrl(s.avatarUrl);
  const avatarClass = s.isLive ? "ring-2 ring-brand" : "opacity-60 grayscale";
  // 跟直播卡片一樣 沒有預覽圖或離線又沒有橫幅時放頭像
  const placeholder = (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-linear-to-br from-[#2a1650] via-[#1f1f23] to-[#0e0e10]">
      <Avatar src={avatar} name={s.displayName} size="lg" className={avatarClass} />
      <span className="font-semibold text-ink-soft">{s.isLive ? "直播中" : "離線"}</span>
    </span>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="stack min-w-0">
        {/* 手機撐滿螢幕寬 限高讓標題留在畫面裡 太矮時兩側留黑不裁切 */}
        <div className="relative aspect-video max-h-[65dvh] w-full overflow-hidden rounded-lg bg-black max-sm:-mx-4 max-sm:-mt-4 max-sm:w-[calc(100%+2rem)] max-sm:rounded-none lg:max-h-[calc(100dvh-15.75rem)]">
          {image ? <ExternalImage src={image} alt="" fill className="object-contain" fallback={placeholder} /> : placeholder}
          {s.isLive ? <span className="tw-live-badge">LIVE</span> : image && <span className="tw-overlay-chip top-2 left-2">離線</span>}
          {viewers && <span className="tw-overlay-chip bottom-2 left-2">{viewers}</span>}
          {duration && <span className="tw-overlay-chip top-2 right-2">{duration}</span>}
        </div>
        {/* 直播中才有標題與遊戲 開台狀態已經標在預覽上 這裡不重複 */}
        {live && (
          <div className="flex min-w-0 items-start gap-4">
            <Avatar src={avatar} name={s.displayName} size="md" className={avatarClass} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p title={live.title ?? undefined} className="line-clamp-2 text-xl font-semibold break-words text-ink">
                {live.title ?? `${s.displayName} 正在直播`}
              </p>
              {live.gameName && <p className="truncate text-brand-ink">{live.gameName}</p>}
            </div>
            {live.gameName && <GameBoxArt url={live.boxArtUrl} size="lg" />}
          </div>
        )}
      </div>
      <aside className="stack">
        <div className="panel flex flex-col gap-3">
          {/* 手機上開關只剩圖示 旁邊寫出它管的是什麼 */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-ink">開台通知</span>
            <NotifyToggle action={setStreamerNotifyAction} id={s.id} enabled={s.notifyEnabled} subject={s.displayName} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-soft">訂閱狀態</span>
            <StatusChip badge={badge} />
          </div>
          {badge.detail && <p className={`text-sm leading-relaxed ${badge.tone === "danger" ? "text-danger" : "text-ink-soft"}`}>{badge.detail}</p>}
        </div>
        {/* 右欄只有 22rem 很長的帳號截斷 不撐出橫向捲動 */}
        <a href={twitchChannelUrl(s.login)} target="_blank" rel="noreferrer" className="btn-secondary">
          <Icon name="external-link" className="size-4" />
          <span className="min-w-0 truncate">在 Twitch 開啟（twitch.tv/{s.login}）</span>
        </a>
        <div className="button-row justify-end">
          <ActionButton
            action={removeStreamerAction}
            fields={{ id: s.id }}
            confirmMessage={`確定不再追蹤「${s.displayName}」？`}
            alertMessage
            pendingLabel={
              <>
                <Icon name="trash-2" className="size-3.5" />
                刪除中…
              </>
            }
            className="btn-danger btn-sm"
          >
            <Icon name="trash-2" className="size-3.5" />
            刪除
          </ActionButton>
        </div>
      </aside>
    </div>
  );
}
