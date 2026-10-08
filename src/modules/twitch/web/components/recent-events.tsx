import { requireSession } from "@/core/auth";
import { formatTaipeiDateTime } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { cachedRecentEvents } from "../../service/cached";

export async function RecentEvents() {
  await requireSession();
  const events = await cachedRecentEvents(20);

  if (events.length === 0) {
    return <EmptyState icon="radio" title="還沒有收到開關台通知" hint="追蹤的主播開台或關台時，紀錄會出現在這裡" />;
  }

  return (
    <ul className="card divide-y divide-line p-0 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={e.type === "online" ? "chip chip-brand shrink-0" : "chip shrink-0"}>{e.type === "online" ? "開台" : "關台"}</span>
            <span className="truncate font-semibold text-ink">{e.displayName ?? "（已刪除的主播）"}</span>
            <time dateTime={e.receivedAt.toISOString()} className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
              {formatTaipeiDateTime(e.receivedAt)}
            </time>
          </div>
          {(e.title || e.category) && (
            <div className="flex min-w-0 items-center gap-2">
              {e.title && <span className="truncate text-ink-soft">{e.title}</span>}
              {e.category && <span className="chip chip-accent shrink-0">{e.category}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
