import { requireSession } from "@/core/auth";
import { ActionButton } from "@/core/ui/action-button";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { NotifyToggle } from "@/core/ui/notify-toggle";
import { StatusText, type StatusTone } from "@/core/ui/status-text";
import { subscriptionsHealthy } from "../../lib/subscriptions";
import { cachedStreamers } from "../../service/cached";
import { removeStreamerAction, setStreamerNotifyAction } from "../actions";
import { describeSubscriptionStatus } from "../status";

export async function StreamerList() {
  await requireSession();
  const streamers = await cachedStreamers();

  if (streamers.length === 0) {
    return <EmptyState icon="heart" title="還沒有追蹤任何主播" hint="在上面輸入 Twitch 帳號，主播開台時就會通知你" />;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {streamers.map((s) => {
        const failed = !subscriptionsHealthy(s);
        const tone: StatusTone = failed ? "danger" : s.subscriptionStatus === "enabled" ? "success" : "warning";
        // 開台中的頭像加粉色外圈，一眼就看得出誰在直播
        const ring = s.isLive ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-solid" : "ring-1 ring-accent-line";
        return (
          <li key={s.id} className="card flex items-center gap-3 p-4">
            {s.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 頭像來自 Twitch CDN，不經過 next/image 設定網域
              <img src={s.profileImageUrl} alt="" className={`size-11 shrink-0 rounded-full object-cover ${ring}`} />
            ) : (
              <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent-ink ${ring}`}>
                {Array.from(s.displayName)[0]?.toUpperCase()}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <a
                  href={`https://twitch.tv/${s.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-semibold text-ink hover:text-accent-ink hover:underline"
                >
                  {s.displayName}
                </a>
                {s.isLive && <span className="chip chip-live shrink-0">LIVE</span>}
              </div>
              <StatusText tone={tone} title={s.subscriptionStatus ?? ""}>
                訂閱狀態：{describeSubscriptionStatus(s.subscriptionStatus)}
              </StatusText>
            </div>
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
          </li>
        );
      })}
    </ul>
  );
}
