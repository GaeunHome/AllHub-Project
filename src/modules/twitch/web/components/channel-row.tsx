import { externalAssetUrl } from "@/core/external-url";
import { ActionButton } from "@/core/ui/action-button";
import { Avatar } from "@/core/ui/avatar";
import { Icon } from "@/core/ui/icon";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import { StatusChip } from "@/core/ui/status-chip";
import { formatViewerCount, type StreamerVisual } from "../../lib/visuals";
import type { TwitchStreamer } from "../../data/schema";
import { removeStreamerAction, setStreamerNotifyAction } from "../actions";
import { subscriptionBadge } from "../status";

/** 照 Twitch 側欄的追蹤清單：直播中顯示遊戲與紅點加人數，離線的變灰；點開才看得到訂閱狀態、通知開關與刪除 */
export function ChannelRow({ streamer: s }: { streamer: StreamerVisual<TwitchStreamer> }) {
  const badge = subscriptionBadge(s);
  const viewers = formatViewerCount(s.live?.viewerCount ?? null)?.replace(" 人觀看", "");
  return (
    <li>
      <details className="group">
        {/* 每一列一樣高（不論有沒有第二行的遊戲名稱）；左右內距加上清單的 p-1.5，跟手機上其他清單的內容一樣離邊框 20px */}
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-md px-3.5 py-2 transition-colors hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
          <Avatar src={externalAssetUrl(s.avatarUrl)} name={s.displayName} size="sm" className={s.isLive ? "" : "opacity-60 grayscale"} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`truncate text-sm font-semibold ${s.isLive ? "text-ink" : "text-ink-soft"}`}>{s.displayName}</span>
            {s.isLive && <span className="truncate text-[0.8125rem] text-ink-soft">{s.live?.gameName ?? "直播中"}</span>}
          </span>
          {/* 通知關掉、訂閱有問題時在收起來的狀態也看得到 */}
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
          <Icon name="chevron-right" className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
        </summary>
        {/* details 不吃父層的 gap，展開的內容用 margin 跟 summary 隔開 */}
        <div className="panel mt-1 flex flex-col gap-3 rounded-md">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip badge={badge} />
            <a href={`https://twitch.tv/${s.login}`} target="_blank" rel="noreferrer" className="link link-block text-sm">
              twitch.tv/{s.login}
            </a>
          </div>
          {badge.detail && <p className={`text-sm leading-relaxed ${badge.tone === "danger" ? "text-danger" : "text-ink-soft"}`}>{badge.detail}</p>}
          <div className="button-row items-start">
            <NotifyToggle action={setStreamerNotifyAction} id={s.id} enabled={s.notifyEnabled} subject={s.displayName} />
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
        </div>
      </details>
    </li>
  );
}
