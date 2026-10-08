import Link from "next/link";
import { requireSession } from "@/core/auth";
import { formatTaipeiDateTime } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { SectionTitle } from "@/core/ui/page-header";
import { ListSkeleton, LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { MIN_MONTH, addMonths, formatMonth, resolveMonth, selectableMonths, taipeiMonth, type MonthKey } from "../../lib/month";
import { earliestMonth, entryLabel, goalProgress, type GoalProgress, type GoalStatus } from "../../lib/summary";
import type { SavingsEntry, SavingsGoal } from "../../data/schema";
import { cachedEntryTotals, cachedGoals, cachedMonthEntries } from "../../service/cached";
import { deleteEntryAction } from "../actions";
import { RecordGoalForm, TemporaryEntryForm } from "./entry-forms";
import { monthHref, type SearchParams } from "./month-href";
import { MonthSelect } from "./month-select";

const STATUS_CHIP: Record<GoalStatus, { className: string; label: string }> = {
  done: { className: "chip chip-success", label: "已存" },
  partial: { className: "chip chip-warning", label: "存了一部分" },
  pending: { className: "chip", label: "還沒存" },
};

export async function MonthRecords({ searchParams }: { searchParams: SearchParams }) {
  await requireSession();
  const current = taipeiMonth(new Date());
  const month = resolveMonth((await searchParams).month, current);
  const [goals, entries, totals] = await Promise.all([cachedGoals(), cachedMonthEntries(month), cachedEntryTotals()]);
  const isCurrent = month === current;

  return (
    <>
      <SectionTitle icon="calendar">{isCurrent ? "本月紀錄" : `${formatMonth(month)}紀錄`}</SectionTitle>
      <div className="flex flex-col gap-4">
        <MonthSwitcher month={month} current={current} options={selectableMonths(current, earliestMonth(totals), month)} />
        <GoalChecklist progress={goalProgress(goals, entries)} month={month} isCurrent={isCurrent} />
        <EntryList entries={entries} month={month} />
      </div>
    </>
  );
}

function MonthSwitcher({ month, current, options }: { month: MonthKey; current: MonthKey; options: MonthKey[] }) {
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const disabled = "btn-secondary btn-sm cursor-not-allowed opacity-55";

  return (
    <nav aria-label="切換月份" className="flex flex-wrap items-center gap-2">
      {previous >= MIN_MONTH ? (
        <Link href={monthHref(previous)} scroll={false} className="btn-secondary btn-sm" aria-label={`上一個月（${formatMonth(previous)}）`}>
          <Icon name="chevron-left" className="size-4" />
          上一月
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <Icon name="chevron-left" className="size-4" />
          上一月
        </span>
      )}
      <MonthSelect value={month} options={options.map((m) => ({ value: m, label: formatMonth(m) }))} />
      {next <= current ? (
        <Link href={monthHref(next)} scroll={false} className="btn-secondary btn-sm" aria-label={`下一個月（${formatMonth(next)}）`}>
          下一月
          <Icon name="chevron-right" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" title="不能記錄未來的月份" className={disabled}>
          下一月
          <Icon name="chevron-right" className="size-4" />
        </span>
      )}
      {month !== current && (
        <Link href="/savings" scroll={false} className="btn-ghost btn-sm">
          回到本月
        </Link>
      )}
    </nav>
  );
}

function GoalChecklist({ progress, month, isCurrent }: { progress: GoalProgress<SavingsGoal>[]; month: MonthKey; isCurrent: boolean }) {
  if (progress.length === 0) {
    return <EmptyState icon="target" title="沒有啟用中的固定項目" hint="可以在上面新增或啟用項目，也可以直接在下面記一筆臨時存款" />;
  }

  return (
    <ul className="card divide-y divide-line p-0" aria-label="固定項目這個月存了沒">
      {progress.map(({ goal, saved, remaining, status }) => (
        <li key={goal.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
          <div className="min-w-0 flex-1 basis-44">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-ink">{goal.name}</span>
              <span className={`${STATUS_CHIP[status].className} shrink-0`}>
                {status === "done" && <Icon name="check" className="size-3" />}
                {STATUS_CHIP[status].label}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              已存 {formatTwd(saved)}／每月 {formatTwd(goal.monthlyAmount)}
            </p>
          </div>
          {status !== "done" && (
            // 金額變了就重新掛載，輸入框的預設值才會換成新的「還差多少」
            <RecordGoalForm
              key={`${goal.id}-${month}-${remaining}`}
              goalId={goal.id}
              goalName={goal.name}
              month={month}
              defaultAmount={remaining}
              label={isCurrent ? "記錄本月已存" : "記錄已存"}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function EntryList({ entries, month }: { entries: SavingsEntry[]; month: MonthKey }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">這個月的存款紀錄</h3>
        <p className="text-sm text-muted">
          合計 <span className="font-semibold text-ink tabular-nums">{formatTwd(total)}</span>
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">這個月還沒有紀錄。</p>
      ) : (
        // 負邊距抵掉卡片的內距，分隔線才會跟卡片一樣寬
        <ul className="-mx-5 divide-y divide-line border-t border-line text-sm sm:-mx-6">
          {entries.map((entry) => {
            const { label, tag } = entryLabel(entry);
            return (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-ink">{label}</span>
                    {tag && <span className="chip shrink-0">{tag}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {entry.note && <span className="break-words">{entry.note} · </span>}
                    <time dateTime={entry.createdAt.toISOString()} className="tabular-nums">
                      {formatTaipeiDateTime(entry.createdAt)} 記錄
                    </time>
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-ink tabular-nums">{formatTwd(entry.amount)}</span>
                <ActionButton
                  action={deleteEntryAction}
                  fields={{ entryId: entry.id }}
                  confirmMessage={`確定刪除這筆紀錄（${label} ${formatTwd(entry.amount)}）？刪除後無法復原。`}
                  aria-label={`刪除「${label}」${formatTwd(entry.amount)} 這筆紀錄`}
                  className="btn-danger btn-sm px-2.5 sm:px-3.5"
                >
                  <Icon name="trash-2" className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">刪除</span>
                </ActionButton>
              </li>
            );
          })}
        </ul>
      )}
      {/* 換月份時重新掛載，清掉上個月打到一半的內容與訊息 */}
      <TemporaryEntryForm key={month} month={month} />
    </div>
  );
}

export function MonthRecordsSkeleton() {
  return (
    <>
      <SectionTitle icon="calendar">本月紀錄</SectionTitle>
      <div className="flex flex-col gap-4">
        <LoadingState label="載入這個月的紀錄…" className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </LoadingState>
        <ListSkeleton rows={2} />
      </div>
    </>
  );
}
