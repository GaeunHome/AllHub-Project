import { requireSession } from "@/core/auth";
import { EmptyState } from "@/core/ui/empty-state";
import { SectionTitle } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { followedStreamerVisuals } from "../streamer-visuals";
import { ChannelRow } from "./channel-row";
import { LiveCard } from "./live-card";

/** 「追蹤中」：寬螢幕左邊是追蹤的頻道（Twitch 側欄的樣子）、右邊是直播中的卡片；手機上直播中的排前面 */
export async function Following() {
  const user = await requireSession();
  const visuals = await followedStreamerVisuals(user.id);

  if (visuals.length === 0) {
    return <EmptyState icon="heart" title="還沒有追蹤任何主播" hint="在上面輸入 Twitch 帳號，主播開台時就會通知你" />;
  }

  const live = visuals.filter((s) => s.isLive);
  const now = new Date();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* 兩欄的標題同一個樣子、同一個高度，下面的內容從同一條線開始 */}
      <section aria-labelledby="tw-live" className="stack min-w-0 lg:order-2">
        <SectionTitle id="tw-live" icon="tv">
          直播中
          <span className="text-base font-semibold text-ink-soft tabular-nums">{live.length}</span>
        </SectionTitle>
        {live.length > 0 ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            {live.map((s) => (
              <LiveCard key={s.id} streamer={s} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon="tv" title="目前沒有追蹤的主播在直播" />
        )}
      </section>
      <aside aria-labelledby="tw-channels" className="stack min-w-0 lg:order-1">
        <SectionTitle id="tw-channels" icon="heart">
          追蹤的頻道
        </SectionTitle>
        <ul className="card flex flex-col gap-0.5 rounded-lg p-1.5">
          {visuals.map((s) => (
            <ChannelRow key={s.id} streamer={s} />
          ))}
        </ul>
      </aside>
    </div>
  );
}

export function FollowingSkeleton() {
  return (
    <LoadingState label="載入追蹤的主播…" className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="stack lg:order-2">
        <Skeleton className="h-7 w-24" />
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full rounded-md" />
              <div className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="stack lg:order-1">
        <Skeleton className="h-7 w-28" />
        <div className="card flex flex-col gap-0.5 rounded-lg p-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </LoadingState>
  );
}
