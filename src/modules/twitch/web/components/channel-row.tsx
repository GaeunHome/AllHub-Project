import { externalAssetUrl } from "@/core/external-url";
import { ActionButton } from "@/core/ui/action-button";
import { Avatar } from "@/core/ui/avatar";
import { DialogButton } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import { StatusChip } from "@/core/ui/status-chip";
import { formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { TwitchStreamer } from "../../data/schema";
import { removeStreamerAction, setStreamerNotifyAction } from "../actions";
import { subscriptionBadge } from "../status";

type RowProps = { streamer: StreamerVisual<TwitchStreamer> };

/** 照 Twitch 側欄的追蹤清單：直播中顯示遊戲與紅點加人數，離線的變灰；點了打開視窗看訂閱狀態、通知開關與刪除 */
export function ChannelRow({ streamer: s }: RowProps) {
  const badge = subscriptionBadge(s);
  const viewers = formatViewerCount(s.live?.viewerCount ?? null)?.replace(" 人觀看", "");
  return (
    <li>
      <DialogButton
        title={s.displayName}
        // 每一列一樣高（不論有沒有第二行的遊戲名稱）；左右內距加上清單的 p-1.5，跟手機上其他清單的內容一樣離邊框 20px
        buttonClassName="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-3.5 py-2 text-left transition-colors hover:bg-surface-muted"
        label={
          <>
            <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="sm" className={s.isLive ? "" : "opacity-60 grayscale"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate text-sm font-semibold ${s.isLive ? "text-ink" : "text-ink-soft"}`}>{s.displayName}</span>
              {s.isLive && <span className="truncate text-[0.8125rem] text-ink-soft">{s.live?.gameName ?? "直播中"}</span>}
            </span>
            {/* 通知關掉、訂閱有問題時在列上也看得到 */}
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
        <ChannelDetail streamer={s} />
      </DialogButton>
    </li>
  );
}

/** 視窗裡的內容，在伺服器算繪好交給 DialogButton */
export function ChannelDetail({ streamer: s }: RowProps) {
  const badge = subscriptionBadge(s);
  const viewers = formatViewerCount(s.live?.viewerCount ?? null);
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="lg" className={s.isLive ? "" : "opacity-60 grayscale"} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {s.isLive ? (
              <span className="chip chip-live">直播中</span>
            ) : (
              <span className="chip">離線</span>
            )}
            {viewers && <span className="text-sm text-ink-soft tabular-nums">{viewers}</span>}
          </div>
          {s.live?.gameName && <span className="truncate font-semibold text-ink">{s.live.gameName}</span>}
          {s.live?.title && <p className="text-sm break-words text-ink-soft">{s.live.title}</p>}
        </div>
      </div>
      <div className="panel flex flex-col gap-3">
        {/* 手機上開關只剩圖示，旁邊寫出它管的是什麼 */}
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
      <a href={`https://twitch.tv/${s.login}`} target="_blank" rel="noreferrer" className="btn-secondary">
        <Icon name="external-link" className="size-4" />
        在 Twitch 開啟（twitch.tv/{s.login}）
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
    </>
  );
}
