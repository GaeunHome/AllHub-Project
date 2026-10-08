import { requireSession } from "@/core/auth";
import { ActionButton } from "@/core/ui/action-button";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import { StatusText, type StatusTone } from "@/core/ui/status-text";
import { cachedChannels } from "../../service/cached";
import { removeChannelAction, setChannelNotifyAction } from "../actions";
import { describeChannelStatus } from "../status";

export async function ChannelList() {
  await requireSession();
  const channels = await cachedChannels();

  if (channels.length === 0) {
    return <EmptyState icon="tv" title="還沒有追蹤任何頻道" hint="在上面貼頻道網址或 @帳號，新影片上架時就會通知你" />;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {channels.map((channel) => {
        const status = describeChannelStatus(channel.subscriptionStatus, channel.leaseExpiresAt);
        const tone: StatusTone = status.startsWith("訂閱失敗") ? "danger" : status.startsWith("正常") ? "success" : "warning";
        return (
          <li key={channel.id} className="card flex items-center gap-3 p-4">
            {channel.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- 外部頭像，不經 next/image 最佳化
              <img src={channel.thumbnail} alt="" className="size-11 shrink-0 rounded-full object-cover ring-1 ring-accent-line" />
            ) : (
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent-ink ring-1 ring-accent-line">
                {Array.from(channel.title)[0]?.toUpperCase()}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <a
                href={`https://www.youtube.com/channel/${channel.channelId}`}
                target="_blank"
                rel="noreferrer"
                className="truncate font-semibold text-ink hover:text-accent-ink hover:underline"
              >
                {channel.title}
              </a>
              <StatusText tone={tone} title={status}>
                {status}
              </StatusText>
            </div>
            <NotifyToggle action={setChannelNotifyAction} id={channel.id} enabled={channel.notifyEnabled} subject={channel.title} />
            <ActionButton
              action={removeChannelAction}
              fields={{ id: channel.id }}
              confirmMessage={`確定不再追蹤「${channel.title}」？`}
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
          </li>
        );
      })}
    </ul>
  );
}
