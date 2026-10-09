import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import type { GoalLike, MonthProgress } from "../../lib/summary";

/** 首頁卡片與記帳頁的總覽共用：已存、應存、還差，進度條與達成率；卡片窄（首頁並排）時金額一列一個，寬的時候三個並排 */
export function MonthProgressSummary({ progress }: { progress: MonthProgress<GoalLike> }) {
  const { saved, planned, remaining, percent, doneGoals, goals } = progress;
  const allDone = goals.length > 0 && remaining === 0;

  return (
    <div className="@container flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 @md:grid-cols-3">
        <AmountTile icon="wallet" label="已存" amount={saved} />
        <AmountTile icon="target" label="應存" amount={planned} />
        <AmountTile icon="coins" label="還差" amount={remaining} />
      </dl>
      <div className="flex flex-col gap-2">
        {/* 進度條只是輔助，百分比寫在下面那行；多存的封頂畫滿 */}
        <div aria-hidden className="progress-track h-2.5">
          <div className="progress-fill" style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-ink">
          {goals.length === 0 ? (
            <p>沒有啟用中的項目</p>
          ) : allDone ? (
            <p className="flex items-center gap-1.5 font-medium text-success">
              <Icon name="circle-check" className="size-4" />
              所有項目都存滿了
            </p>
          ) : (
            <p>
              <span className="tabular-nums">
                {doneGoals}／{goals.length}
              </span>{" "}
              個項目已存滿
            </p>
          )}
          {percent !== null && <p className="font-semibold tabular-nums">達成 {percent}%</p>}
        </div>
      </div>
    </div>
  );
}

/** 標籤在左、金額靠右（tabular-nums），一列一列對齊 */
export function AmountTile({ icon, label, amount }: { icon: UiIconName; label: string; amount: number }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-muted px-4">
      <dt className="flex items-center gap-2 text-ink">
        <Icon name={icon} className="size-4 text-accent" />
        {label}
      </dt>
      <dd className="text-lg font-bold [overflow-wrap:anywhere] text-ink tabular-nums">{formatTwd(amount)}</dd>
    </div>
  );
}

export function MonthProgressSkeleton() {
  return (
    <LoadingState label="載入本月存款…" className="@container flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 @md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-2.5 rounded-full" />
      <Skeleton className="h-5 w-40" />
    </LoadingState>
  );
}
