import { requireSession } from "@/core/auth";
import { formatTaipeiDateTime } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { formatMonth, resolveMonth, taipeiMonth } from "../../lib/month";
import { entryLabel } from "../../lib/summary";
import { cachedMonthEntries } from "../../service/cached";
import { deleteEntryAction } from "../actions";
import type { SearchParams } from "./month-href";

/** 選到的月份的每一筆存款；合計已經在最上面的總覽，這裡不再算一次 */
export async function EntryDetails({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const current = taipeiMonth(new Date());
  const month = resolveMonth((await searchParams).month, current);
  const entries = await cachedMonthEntries(user.id, month);

  if (entries.length === 0) return <p className="text-ink">{month === current ? "這個月" : formatMonth(month)}還沒有紀錄。</p>;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {entries.map((entry) => {
        const { label, tag } = entryLabel(entry);
        return (
          <li key={entry.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold text-ink">{label}</span>
                {tag && <span className="chip shrink-0">{tag}</span>}
              </div>
              <p className="text-sm text-ink-soft">
                {entry.note && <span className="break-words">{entry.note} · </span>}
                <time dateTime={entry.createdAt.toISOString()} className="tabular-nums">
                  {formatTaipeiDateTime(entry.createdAt)} 記錄
                </time>
              </p>
            </div>
            <span className="w-28 shrink-0 text-right font-semibold text-ink tabular-nums">{formatTwd(entry.amount)}</span>
            <ActionButton
              action={deleteEntryAction}
              fields={{ entryId: entry.id }}
              confirmMessage={`確定刪除這筆紀錄（${label} ${formatTwd(entry.amount)}）？刪除後無法復原。`}
              aria-label={`刪除「${label}」${formatTwd(entry.amount)} 這筆紀錄`}
              className="btn-danger btn-icon sm:w-auto sm:px-4"
            >
              <Icon name="trash-2" className="size-4" />
              <span className="sr-only sm:not-sr-only">刪除</span>
            </ActionButton>
          </li>
        );
      })}
    </ul>
  );
}

export function EntryDetailsSkeleton() {
  return (
    <LoadingState label="載入紀錄明細…" className="stack">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${i === 1 ? "w-1/3" : "w-1/2"}`} />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-11 w-11 rounded-lg sm:w-20" />
        </div>
      ))}
    </LoadingState>
  );
}
