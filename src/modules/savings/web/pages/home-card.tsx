import Link from "next/link";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { HomeCard } from "@/core/ui/home-card";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { StatusChip } from "@/core/ui/status-chip";
import { monthTotals } from "../../lib/ledger";
import { formatTwd } from "../../lib/money";
import { taipeiMonth } from "../../lib/month";
import type { PendingItem } from "../../lib/pending";
import { cachedCategoryTotals } from "../../service/cached";
import { Fact, FactList } from "../components/fact-list";
import { overdueBadge, pendingDate } from "../dashboard-view";
import { loadPending } from "../overview-data";
import { SAVINGS_PATHS } from "../paths";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SavingsHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="資產與待處理" skeleton={<FinanceSnapshotSkeleton />}>
      <FinanceSnapshot />
    </HomeCard>
  );
}

/** 跟總覽用同一套計算 總資產含持股的市值 數字才一致 */
export async function FinanceSnapshot() {
  const user = await requireSession();
  const now = new Date();
  const [{ input, state, items }, totals] = await Promise.all([loadPending(user.id, now), cachedCategoryTotals(user.id)]);
  if (input.accounts.length === 0) {
    return (
      <EmptyState
        compact
        icon="wallet"
        title="還沒有帳戶"
        action={
          <Link href={SAVINGS_PATHS.overview} className="btn-secondary">
            開始使用
          </Link>
        }
      />
    );
  }

  const { expense } = monthTotals(totals, taipeiMonth(now));
  return (
    <FactList>
      <Fact label="總資產">
        <span className="text-xl font-bold tracking-tight">{formatTwd(state.totalAssets)}</span>
      </Fact>
      <Fact label="本月支出">
        <span className="font-medium">{formatTwd(expense)}</span>
      </Fact>
      <Fact label="待處理">{items.length === 0 ? <span className="text-ink-soft">沒有</span> : <PendingSummary count={items.length} first={items[0]} />}</Fact>
    </FactList>
  );
}

/** 幾筆 加上最早的那一筆的名稱與日期 逾期的用標籤 */
function PendingSummary({ count, first }: { count: number; first: PendingItem }) {
  return (
    <>
      <span>
        <span className="font-medium">{count} 筆</span> · {first.name} {pendingDate(first)}
      </span>
      {first.status === "overdue" && <StatusChip badge={overdueBadge(first.daysLeft)} />}
    </>
  );
}

/** 跟內容一樣三列 載入完不會跳 */
export function FinanceSnapshotSkeleton() {
  return (
    <LoadingState label="載入資產與待處理…" className="flex flex-col divide-y divide-line">
      {["w-32", "w-20", "w-40"].map((width) => (
        <div key={width} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className={`h-5 ${width}`} />
        </div>
      ))}
    </LoadingState>
  );
}
