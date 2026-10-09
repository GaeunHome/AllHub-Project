import Link from "next/link";
import { requireSession } from "@/core/auth";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { MIN_MONTH, addMonths, formatMonth, resolveMonth, selectableMonths, taipeiMonth, type MonthKey } from "../../lib/month";
import { earliestMonth, monthProgress, type GoalProgress, type GoalStatus } from "../../lib/summary";
import type { SavingsGoal } from "../../data/schema";
import { cachedEntryTotals, cachedGoals } from "../../service/cached";
import { GoalEntryRow, TemporaryEntry } from "./entry-forms";
import { AddGoalForm } from "./goal-forms";
import { monthHref, type SearchParams } from "./month-href";
import { MonthProgressSummary } from "./month-progress";
import { MonthSelect } from "./month-select";

/** 記帳頁最上面的兩張卡：選到的月份的總覽（跟首頁卡片同一套計算），以及每個項目這個月存了沒 */
export async function MonthPanel({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const current = taipeiMonth(new Date());
  const month = resolveMonth((await searchParams).month, current);
  const [goals, totals] = await Promise.all([cachedGoals(user.id), cachedEntryTotals(user.id)]);
  const isCurrent = month === current;
  const progress = monthProgress(goals, totals, month);

  return (
    <>
      <section aria-labelledby="savings-overview" className="card stack">
        <CardHeader id="savings-overview" actions={<MonthSwitcher month={month} current={current} options={selectableMonths(current, earliestMonth(totals), month)} />}>
          {isCurrent ? "本月總覽" : `${formatMonth(month)}總覽`}
        </CardHeader>
        {goals.length === 0 && progress.saved === 0 ? (
          <p className="text-ink">新增每月固定要存的項目後，這裡會顯示每個月存了多少、還差多少。</p>
        ) : (
          <MonthProgressSummary progress={progress} />
        )}
      </section>

      <section aria-labelledby="savings-goals" className="card stack">
        <CardHeader id="savings-goals">{isCurrent ? "本月項目" : `${formatMonth(month)}的項目`}</CardHeader>
        {goals.length === 0 ? (
          <>
            <EmptyState compact icon="sparkles" title="還沒有每月固定要存的項目" hint="例如「緊急預備金」每月 10,000 元" />
            <AddGoalForm />
          </>
        ) : progress.goals.length === 0 ? (
          <EmptyState compact icon="target" title="沒有啟用中的固定項目" hint="到下方「管理項目」啟用，或直接記一筆臨時存款" />
        ) : (
          <GoalChecklist progress={progress.goals} month={month} />
        )}
        {/* 換月份時重新掛載，清掉上個月打到一半的內容與訊息 */}
        <TemporaryEntry key={month} month={month} />
      </section>
    </>
  );
}

const STATUS_CHIP: Record<GoalStatus, string> = { done: "chip chip-success", partial: "chip chip-warning", pending: "chip" };

function GoalStatusChip({ status, remaining }: { status: GoalStatus; remaining: number }) {
  return (
    <span className={`${STATUS_CHIP[status]} shrink-0 tabular-nums`}>
      {status === "done" && <Icon name="check" className="size-3" />}
      {status === "done" ? "已存滿" : status === "partial" ? `還差 ${formatTwd(remaining)}` : "還沒存"}
    </span>
  );
}

/** 每個項目一列：名稱、狀態標籤、每月金額（靠右）；還沒存滿的有「記一筆」，按了才出現輸入框 */
function GoalChecklist({ progress, month }: { progress: GoalProgress<SavingsGoal>[]; month: MonthKey }) {
  return (
    // 下面還有「臨時存款」，清單底下也要一條線隔開
    <ul aria-label="固定項目這個月存了沒" className="card-list border-b">
      {progress.map(({ goal, remaining, status }) => (
        <li key={`${goal.id}-${month}`} className="card-row">
          <GoalEntryRow
            goalId={goal.id}
            goalName={goal.name}
            month={month}
            defaultAmount={remaining}
            canRecord={status !== "done"}
            amount={
              <>
                <span className="text-sm text-ink-soft">每月 </span>
                <span className="font-semibold text-ink tabular-nums">{formatTwd(goal.monthlyAmount)}</span>
              </>
            }
          >
            <span className="truncate font-semibold text-ink">{goal.name}</span>
            <GoalStatusChip status={status} remaining={remaining} />
          </GoalEntryRow>
        </li>
      ))}
    </ul>
  );
}

/** 按鈕與選單一樣高；不能記未來的月份，下一月在本月時停用 */
function MonthSwitcher({ month, current, options }: { month: MonthKey; current: MonthKey; options: MonthKey[] }) {
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const arrow = "btn-secondary btn-icon";
  const disabled = `${arrow} cursor-not-allowed opacity-55`;

  return (
    <nav aria-label="切換月份" className="button-row">
      {month !== current && (
        <Link href="/savings" scroll={false} className="btn-ghost">
          回到本月
        </Link>
      )}
      {previous >= MIN_MONTH ? (
        <Link href={monthHref(previous)} scroll={false} className={arrow} aria-label={`上一個月（${formatMonth(previous)}）`}>
          <Icon name="chevron-left" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <Icon name="chevron-left" className="size-4" />
          <span className="sr-only">上一個月</span>
        </span>
      )}
      <MonthSelect value={month} options={options.map((m) => ({ value: m, label: formatMonth(m) }))} />
      {next <= current ? (
        <Link href={monthHref(next)} scroll={false} className={arrow} aria-label={`下一個月（${formatMonth(next)}）`}>
          <Icon name="chevron-right" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" title="不能記錄未來的月份" className={disabled}>
          <Icon name="chevron-right" className="size-4" />
          <span className="sr-only">下一個月（不能記錄未來的月份）</span>
        </span>
      )}
    </nav>
  );
}

export function MonthPanelSkeleton() {
  return (
    <>
      <LoadingState label="載入本月總覽…" className="card stack">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-11 w-60 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-2.5 rounded-full" />
      </LoadingState>
      <LoadingState label="載入本月項目…" className="card stack">
        <Skeleton className="h-7 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className={`h-5 ${i === 1 ? "w-1/3" : "w-1/2"}`} />
            <Skeleton className="ml-auto h-5 w-28" />
          </div>
        ))}
        <Skeleton className="h-11 w-32 rounded-lg" />
      </LoadingState>
    </>
  );
}
