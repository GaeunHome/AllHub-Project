import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { formatTaipeiDateTime } from "@/core/time";
import { Avatar } from "@/core/ui/avatar";
import { EmptyState } from "@/core/ui/empty-state";
import { cacheKeyIds } from "../../lib/visuals";
import { cachedRecentEvents, cachedStreamerProfiles, cachedStreamers } from "../../service/cached";

export async function RecentEvents() {
  const user = await requireSession();
  const [events, streamers] = await Promise.all([cachedRecentEvents(user.id, 20), cachedStreamers(user.id)]);

  if (events.length === 0) {
    return <EmptyState icon="radio" title="還沒有收到開關台通知" hint="追蹤的主播開台或關台時，紀錄會出現在這裡" />;
  }

  // 用追蹤中主播的 id 查頭像，跟主播列表共用同一份快取；Helix 不能用時退回追蹤時存下的頭像
  const profiles = await cachedStreamerProfiles(cacheKeyIds(streamers.map((s) => s.broadcasterId)));
  const avatarOf = new Map((profiles ?? []).map((p) => [p.id, p.profileImageUrl]));

  return (
    <ul className="card divide-y divide-line overflow-hidden rounded-lg p-0 text-sm">
      {events.map((e) => (
        <li key={e.id} className="card-row flex items-start gap-3">
          <Avatar src={externalAssetUrl(avatarOf.get(e.broadcasterId) ?? e.profileImageUrl)} name={e.displayName} size="sm" className="ring-1 ring-accent-line" />
          {/* 只有一行時跟頭像垂直置中，兩行時從頭像的頂端開始 */}
          <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={e.type === "online" ? "chip chip-brand shrink-0" : "chip shrink-0"}>{e.type === "online" ? "開台" : "關台"}</span>
              <span className="truncate font-semibold text-ink">{e.displayName}</span>
              <time dateTime={e.receivedAt.toISOString()} className="ml-auto shrink-0 text-[0.8125rem] whitespace-nowrap text-ink-soft tabular-nums">
                {formatTaipeiDateTime(e.receivedAt)}
              </time>
            </div>
            {(e.title || e.category) && (
              <div className="flex min-w-0 items-center gap-2">
                {e.title && <span className="truncate text-ink-soft">{e.title}</span>}
                {e.category && <span className="chip chip-accent shrink-0">{e.category}</span>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
