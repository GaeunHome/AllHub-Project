import { Suspense } from "react";
import { externalAssetUrl } from "@/core/external-url";
import { ActionButton } from "@/core/ui/action-button";
import { Avatar } from "@/core/ui/avatar";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import type { YoutubeChannel } from "../../data/schema";
import { removeChannelAction, setChannelNotifyAction } from "../actions";
import { channelStatusBadge } from "../status";
import { ChannelAvatar } from "./channel-avatar";
import { RenewButton } from "./renew-button";

const STATUS_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

/** 像 YouTube 側欄的「訂閱內容」：頭像加名稱；通知開關、刪除與訂閱狀態收進每個頻道的選單 */
export function ChannelSidebar({ channels }: { channels: YoutubeChannel[] }) {
  return (
    <nav aria-labelledby="youtube-subscriptions" className="stack min-w-0 lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-start justify-between gap-3">
        {/* 跟右邊的「續訂」一樣高，文字垂直置中 */}
        <h2 id="youtube-subscriptions" className="flex min-h-9 items-center text-base font-semibold text-ink pointer-coarse:min-h-11">
          訂閱內容
        </h2>
        <RenewButton />
      </div>
      {channels.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-soft">還沒有追蹤頻道：在上面貼頻道網址或 @帳號，新影片上架時就會通知你</p>
      ) : (
        // 寬螢幕的每一列有左右內距（滑過時的底色），清單往外撐開同樣的距離，頭像對齊標題的左邊線
        <ul className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:-mx-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
          {channels.map((channel) => (
            <li key={channel.id} className="shrink-0">
              <ChannelEntry channel={channel} />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function ChannelEntry({ channel }: { channel: YoutubeChannel }) {
  const status = channelStatusBadge(channel.subscriptionStatus, channel.leaseExpiresAt);
  // 手機是大頭像（lg）、名稱在下面；寬螢幕是側欄跟文字同一行的小頭像（xs 的大小）
  const avatarClass = "lg:size-6 lg:text-[0.6875rem]";

  return (
    <MoreMenu
      label={`${channel.title} 的選項`}
      triggerClassName="yt-channel"
      trigger={
        <>
          <span className="relative shrink-0">
            {/* 頻道頁的頭像要等 YouTube 回應，先顯示追蹤時存下的頭像或文字頭像 */}
            <Suspense fallback={<Avatar src={externalAssetUrl(channel.thumbnail)} name={channel.title} size="lg" className={avatarClass} />}>
              <ChannelAvatar channelRef={channel.channelId} name={channel.title} stored={channel.thumbnail} size="lg" className={avatarClass} />
            </Suspense>
            {/* 訂閱有問題時在頭像角落放一個點，原因在選單裡 */}
            {status.tone !== "success" && (
              <span className={`status-dot status-dot-${status.tone} absolute right-0 bottom-0 size-3 ring-2 ring-[var(--bg-base)] lg:size-2.5`} />
            )}
          </span>
          <span className="yt-channel-name">{channel.title}</span>
          <Icon name="ellipsis-vertical" className="yt-channel-more size-4" />
        </>
      }
    >
      <div className="flex flex-col gap-0.5 px-3 pt-1.5 pb-2">
        <p className="font-semibold break-words text-ink">{channel.title}</p>
        <p className={`text-sm ${STATUS_TEXT[status.tone]}`}>
          {status.label}
          {status.detail && `（${status.detail}）`}
        </p>
      </div>
      <a href={`https://www.youtube.com/channel/${channel.channelId}`} target="_blank" rel="noreferrer" className="menu-item">
        <Icon name="external-link" className="size-4" />
        在 YouTube 開啟頻道
      </a>
      <NotifyToggle variant="menu" action={setChannelNotifyAction} id={channel.id} enabled={channel.notifyEnabled} subject={channel.title} />
      <ActionButton
        action={removeChannelAction}
        fields={{ id: channel.id }}
        confirmMessage={`確定不再追蹤「${channel.title}」？`}
        alertMessage
        formClassName="flex flex-col gap-1"
        pendingLabel={
          <>
            <Icon name="trash-2" className="size-4" />
            刪除中…
          </>
        }
        className="menu-item menu-item-danger"
      >
        <Icon name="trash-2" className="size-4" />
        取消追蹤
      </ActionButton>
    </MoreMenu>
  );
}
