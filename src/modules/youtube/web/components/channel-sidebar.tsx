import Link from "next/link";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import type { FollowedChannel } from "../../data/schema";
import { SAVED_VIDEOS_PATH, youtubeChannelUrl } from "../../lib/urls";
import { removeChannelAction, setChannelNotifyAction } from "../actions";
import { channelStatusBadge } from "../status";
import { ChannelAvatar } from "./channel-avatar";
import { RenewButton } from "./renew-button";

const STATUS_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

/**
 * 像 YouTube 的側欄 上面是已保留的入口 像稍後觀看 下面是訂閱內容
 * 通知開關 刪除與訂閱狀態收進每個頻道的選單
 */
export function ChannelSidebar({ channels, savedCount }: { channels: FollowedChannel[]; savedCount: number }) {
  return (
    <div className="stack min-w-0 lg:sticky lg:top-24 lg:self-start">
      <SavedVideosLink count={savedCount} />
      <ChannelList channels={channels} />
    </div>
  );
}

/** 寬螢幕是側欄的一列 圖示跟頻道頭像對齊 手機在訂閱內容上面撐滿一整列 */
function SavedVideosLink({ count }: { count: number }) {
  return (
    <Link href={SAVED_VIDEOS_PATH} className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 font-medium text-ink transition-colors hover:bg-surface-muted lg:min-h-10 lg:text-sm">
      <span className="grid size-6 shrink-0 place-items-center">
        <Icon name="bookmark" className="size-5" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        已保留（<span className="tabular-nums">{count}</span>）
      </span>
      <Icon name="chevron-right" className="size-4 shrink-0 text-muted" />
    </Link>
  );
}

function ChannelList({ channels }: { channels: FollowedChannel[] }) {
  return (
    <nav aria-labelledby="youtube-subscriptions" className="stack min-w-0">
      <div className="flex items-start justify-between gap-3">
        {/* 跟右邊的續訂一樣高 文字垂直置中 */}
        <h2 id="youtube-subscriptions" className="flex min-h-9 items-center text-base font-semibold text-ink pointer-coarse:min-h-11">
          訂閱內容
        </h2>
        <RenewButton />
      </div>
      {channels.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-soft">還沒有追蹤頻道：在上面貼頻道網址或 @帳號，新影片上架時就會通知你</p>
      ) : (
        // 寬螢幕每一列有滑過時底色用的左右內距 清單往外撐開同樣距離 頭像才對齊標題
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

function ChannelEntry({ channel }: { channel: FollowedChannel }) {
  const status = channelStatusBadge(channel.subscriptionStatus, channel.leaseExpiresAt);
  // 手機是 lg 大頭像 名稱在下面 寬螢幕是跟文字同一行的 xs 小頭像
  const avatarClass = "lg:size-6 lg:text-[0.6875rem]";

  return (
    <MoreMenu
      label={`${channel.title} 的選項`}
      triggerClassName="yt-channel"
      trigger={
        <>
          <span className="relative shrink-0">
            {/* 頻道頁的頭像要等 YouTube 回應 先顯示追蹤時存下的頭像或文字頭像 */}
            <ChannelAvatar channelRef={channel.channelId} name={channel.title} stored={channel.thumbnail} size="lg" className={avatarClass} />
            {/* 訂閱有問題時在頭像角落放一個點 原因在選單裡 */}
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
      <a href={youtubeChannelUrl(channel.channelId)} target="_blank" rel="noreferrer" className="menu-item">
        <Icon name="external-link" className="size-4" />
        在 YouTube 開啟頻道
      </a>
      <NotifyToggle variant="menu" label="新影片通知" action={setChannelNotifyAction} id={channel.id} enabled={channel.notifyEnabled} subject={channel.title} />
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
