import Link from "next/link";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { Fact, FactList } from "@/core/ui/fact-list";
import { HomeCard } from "@/core/ui/home-card";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiMonthKey } from "@/core/time";
import { StatusChip } from "@/core/ui/status-chip";
import type { ChecklistItem } from "../../lib/checklist";
import { daysBetween, formatSlashDate } from "../../lib/dates";
import { monthTotals } from "../../lib/ledger";
import { formatTwd } from "../../lib/money";
import { cachedCategoryTotals } from "../../service/cached";
import { overdueBadge } from "../format";
import { loadAccounts, loadChecklist } from "../overview-data";
import { checklistSummary } from "../overview-view";
import { SAVINGS_PATHS } from "../paths";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SavingsHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="資產與要做的事" skeleton={<FinanceSnapshotSkeleton />}>
      <FinanceSnapshot />
    </HomeCard>
  );
}

/** 跟總覽用同一套計算 總資產含持股的市值 要做的事跟這個月要做的事同一份 */
export async function FinanceSnapshot() {
  const user = await requireSession();
  const now = new Date();
  const [{ input, state }, totals, checklist] = await Promise.all([loadAccounts(user.id, now), cachedCategoryTotals(user.id), loadChecklist(user.id, now)]);
  if (input.accounts.length === 0) {
    return (
      <EmptyState
        compact
        icon="wallet"
        title="還沒有帳戶"
        action={
          <Link href={SAVINGS_PATHS.overview} className="btn-secondary">
            開始設定
          </Link>
        }
      />
    );
  }

  const { expense } = monthTotals(totals, taipeiMonthKey(now));
  const { remaining, next } = checklistSummary(checklist.items);
  return (
    <FactList>
      <Fact label="總資產">
        <span className="text-xl font-bold tracking-tight">{formatTwd(state.summary.assets)}</span>
      </Fact>
      <Fact label="本月支出">
        <span className="font-medium">{formatTwd(expense)}</span>
      </Fact>
      <Fact label="這個月">{next === null ? <span>沒有要做的事</span> : <NextToDo remaining={remaining} next={next} today={checklist.today} />}</Fact>
    </FactList>
  );
}

/** 還有幾件 加上最近要做的那一件的名稱與日期 逾期的用標籤 */
function NextToDo({ remaining, next, today }: { remaining: number; next: ChecklistItem; today: string }) {
  return (
    <>
      <span>
        <span className="font-medium">還有 {remaining} 件要做</span> · {next.title} {formatSlashDate(next.date)}
      </span>
      {next.state === "overdue" && <StatusChip badge={overdueBadge(daysBetween(today, next.date))} />}
    </>
  );
}

/** 跟內容一樣三列 載入完不會跳 */
export function FinanceSnapshotSkeleton() {
  return (
    <LoadingState label="載入資產與要做的事…" className="flex flex-col divide-y divide-line">
      {["w-32", "w-20", "w-40"].map((width) => (
        <div key={width} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className={`h-5 ${width}`} />
        </div>
      ))}
    </LoadingState>
  );
}
