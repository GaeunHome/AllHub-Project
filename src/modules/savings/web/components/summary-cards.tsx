import type { ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { taipeiMonth } from "../../lib/month";
import { percentOf, summarize } from "../../lib/summary";
import { cachedEntryTotals, cachedGoals } from "../../service/cached";

// 手機上一欄：兩欄時每張卡不到 170px，大金額與說明文字會擠成好幾行
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

/** 永遠是台北時間的這個月與今年，不跟著下方切換的月份變 */
export async function SummaryCards() {
  await requireSession();
  const current = taipeiMonth(new Date());
  const [goals, totals] = await Promise.all([cachedGoals(), cachedEntryTotals()]);
  const summary = summarize(goals, totals, current);
  const percent = percentOf(summary.thisMonth, summary.planned);

  return (
    <dl className={GRID}>
      <StatCard icon="target" label="本月預計" value={formatTwd(summary.planned)}>
        {summary.activeGoals > 0 ? `${summary.activeGoals} 個啟用中的項目` : "還沒有啟用中的項目"}
      </StatCard>
      <StatCard
        icon="wallet"
        label="本月已存"
        value={formatTwd(summary.thisMonth)}
        meter={percent === null ? undefined : Math.min(percent, 100)}
      >
        {percent === null ? "本月沒有預計金額" : `達成 ${percent}%（${summary.doneGoals}／${summary.activeGoals} 個項目已存滿）`}
      </StatCard>
      <StatCard icon="calendar" label="今年累計" value={formatTwd(summary.thisYear)}>
        {current.slice(0, 4)} 年 1 月起
      </StatCard>
      <StatCard icon="piggy-bank" label="全部累計" value={formatTwd(summary.allTime)}>
        所有紀錄都會一直保留
      </StatCard>
    </dl>
  );
}

function StatCard({ icon, label, value, meter, children }: { icon: UiIconName; label: string; value: string; meter?: number; children: ReactNode }) {
  return (
    <div className="card flex flex-col gap-2 p-4 sm:p-5">
      <dt className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <span className="icon-tile size-8 rounded-xl">
          <Icon name={icon} />
        </span>
        {label}
      </dt>
      <dd className="text-xl font-bold tracking-tight [overflow-wrap:anywhere] text-ink sm:text-2xl">{value}</dd>
      {/* 進度條只是輔助，數字已經寫在下面那行 */}
      {meter !== undefined && (
        <dd aria-hidden className="progress-track">
          <div className="progress-fill" style={{ width: `${meter}%` }} />
        </dd>
      )}
      <dd className="text-xs text-muted">{children}</dd>
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <LoadingState label="載入摘要中…" className={GRID}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </LoadingState>
  );
}
