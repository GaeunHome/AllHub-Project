import type { ReactNode } from "react";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ACCOUNT_GRID, BUDGET_TREND_ROW, DONUT_LAYOUT, DONUT_ROW, KPI_GRID } from "./layout";

// 骨架跟內容用同一份排版常數 串流進來時才不會跳
// 整頁骨架拼起來時只有最外層報載入中 live region 不巢狀

/** label 是 null 時是整頁骨架裡的一塊 不另外報讀 */
function Frame({ label, className, children }: { label: string | null; className?: string; children: ReactNode }) {
  return label === null ? (
    <div className={className}>{children}</div>
  ) : (
    <LoadingState label={label} className={className}>
      {children}
    </LoadingState>
  );
}

type SkeletonProps = { label?: string | null };

export function ToolbarSkeleton({ label = "載入工具列…" }: SkeletonProps) {
  return (
    <Frame label={label} className="flex flex-wrap items-center justify-between gap-3">
      <Skeleton className="h-11 w-72 max-w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-lg" />
        <Skeleton className="h-11 w-24 rounded-lg" />
      </div>
    </Frame>
  );
}

/** 總資產與信用卡未繳下面有沒有小標籤 有的話骨架先留位置 */
export type KpiNotes = { assets: boolean; owed: boolean };

// 整頁骨架還不知道帳戶 照最常見的樣子排 有投資帳戶而且看本月
const USUAL_NOTES: KpiNotes = { assets: true, owed: false };

/** 排法跟 KpiRow 一樣 標籤 20px 數字 28 或 32px 小標籤 22px 載入完高度不變 */
export function KpiSkeleton({ label = "載入數字…", notes = USUAL_NOTES }: SkeletonProps & { notes?: KpiNotes }) {
  return (
    <Frame label={label} className={KPI_GRID}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`card flex flex-col gap-2 @container ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-7 w-32 max-w-full @3xs:h-8" />
          {((i === 0 && notes.assets) || (i === 4 && notes.owed)) && <Skeleton className="h-[1.375rem] w-28 max-w-full rounded-full" />}
        </div>
      ))}
    </Frame>
  );
}

export function DonutCardSkeleton({ label }: { label: string | null }) {
  return (
    <Frame label={label} className="card stack @container min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-11 w-36 rounded-lg" />
      </div>
      <div className={DONUT_LAYOUT}>
        <Skeleton className="size-48 rounded-full" />
        <div className="flex w-full flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function AccountsSkeleton({ label = "載入帳戶…" }: SkeletonProps) {
  return (
    <Frame label={label} className="stack">
      <Skeleton className="h-7 w-24" />
      <div className={ACCOUNT_GRID}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-2.5 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function BudgetSkeleton({ label = "載入預算…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack @container min-w-0">
      <Skeleton className="h-7 w-28" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-2.5 rounded-full" />
        </div>
      ))}
    </Frame>
  );
}

export function TrendSkeleton({ label = "載入趨勢…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack @container min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-6 w-64 max-w-full" />
      <Skeleton className="h-56 rounded-xl" />
    </Frame>
  );
}

/** 整頁第一次載入還不知道有沒有帳戶 先照總覽的樣子排 */
export function OverviewSkeleton() {
  return (
    <LoadingState label="載入總覽…" className="page-stack">
      <ToolbarSkeleton label={null} />
      <KpiSkeleton label={null} />
      <div className={DONUT_ROW}>
        <DonutCardSkeleton label={null} />
        <DonutCardSkeleton label={null} />
      </div>
      <AccountsSkeleton label={null} />
      <div className={BUDGET_TREND_ROW}>
        <BudgetSkeleton label={null} />
        <TrendSkeleton label={null} />
      </div>
    </LoadingState>
  );
}
