import Link from "next/link";
import type { CSSProperties } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { HomeCard } from "@/core/ui/home-card";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { accountBalances, assetSummary, monthTotals } from "../../lib/ledger";
import { taipeiMonth } from "../../lib/month";
import { cachedAccountFlows, cachedAccounts, cachedCategoryTotals } from "../../service/cached";
import { AnimatedNumber } from "../components/motion/animated-number";
import { EntranceScope } from "../components/motion/entrance-scope";
import { SAVINGS_PATHS } from "../paths";

// 看卡片寬度排 窄時一列一個 夠寬時兩個並排 骨架用同一個排法
const AMOUNT_GRID = "grid gap-3 @md:grid-cols-2";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SavingsHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="支出與資產" skeleton={<FinanceSnapshotSkeleton />}>
      {/* 從別頁回到首頁時金額與淡入不重播 contents 不影響卡片的排版 */}
      <EntranceScope className="contents">
        <FinanceSnapshot />
      </EntranceScope>
    </HomeCard>
  );
}

/** 跟總覽用同一套 lib/ledger 計算 數字才一致 */
export async function FinanceSnapshot() {
  const user = await requireSession();
  const [accounts, flows, totals] = await Promise.all([cachedAccounts(user.id), cachedAccountFlows(user.id), cachedCategoryTotals(user.id)]);
  if (accounts.length === 0) {
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

  const { expense } = monthTotals(totals, taipeiMonth(new Date()));
  const { assets } = assetSummary(accounts, accountBalances(accounts, flows));
  return (
    <dl className={AMOUNT_GRID}>
      <AmountRow icon="trending-down" label="本月支出" value={expense} index={0} />
      <AmountRow icon="landmark" label="總資產" value={assets} index={1} />
    </dl>
  );
}

function AmountRow({ icon, label, value, index }: { icon: UiIconName; label: string; value: number; index: number }) {
  return (
    <div className="fin-rise flex min-h-14 items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-2" style={{ "--i": index } as CSSProperties}>
      <dt className="flex items-center gap-2 text-ink">
        <Icon name={icon} className="size-4 text-accent" />
        {label}
      </dt>
      <dd className="text-xl font-bold tracking-tight text-ink tabular-nums">
        <AnimatedNumber value={value} />
      </dd>
    </div>
  );
}

export function FinanceSnapshotSkeleton() {
  return (
    <LoadingState label="載入支出與資產…" className={AMOUNT_GRID}>
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-14 rounded-xl" />
    </LoadingState>
  );
}
