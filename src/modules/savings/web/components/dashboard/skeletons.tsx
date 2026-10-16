import type { ReactNode } from "react";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { OVERVIEW_COLUMNS, OVERVIEW_LEFT, OVERVIEW_RIGHT } from "./layout";

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

/** 頁首那排按鈕裡的一顆 跟按鈕一樣高 */
export function ButtonSkeleton({ icon = false }: { icon?: boolean }) {
  return <Skeleton className={icon ? "size-9 rounded-full" : "h-11 w-28 rounded-lg"} />;
}

export function SummarySkeleton({ label = "載入總資產…" }: SkeletonProps) {
  return (
    <Frame label={label} className="flex flex-col gap-1">
      <Skeleton className="h-5 w-14" />
      <Skeleton className="h-10 w-56 max-w-full sm:h-12" />
      <Skeleton className="h-5 w-80 max-w-full" />
    </Frame>
  );
}

function RowSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-5 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={`h-4 ${wide ? "w-32" : "w-24"}`} />
        <Skeleton className="h-3.5 w-40 max-w-full" />
      </div>
      <Skeleton className="h-4 w-20 shrink-0" />
    </div>
  );
}

export function AccountsSkeleton({ label = "載入帳戶…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card divide-y divide-line overflow-hidden p-0">
      {[2, 1, 1].map((rows, group) => (
        <div key={group}>
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted px-5 py-2 sm:px-6">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="divide-y divide-line">
            {Array.from({ length: rows }, (_, i) => (
              <RowSkeleton key={i} wide={i % 2 === 0} />
            ))}
          </div>
        </div>
      ))}
    </Frame>
  );
}

export function ExpenseSkeleton({ label = "載入本月支出…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack min-w-0">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="card-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-row flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-1.5 rounded-full" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function TrendSkeleton({ label = "載入每月收支…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack min-w-0">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-60 rounded-xl" />
      <Skeleton className="h-5 w-24" />
    </Frame>
  );
}

/** 整頁第一次載入還不知道有沒有帳戶 先照總覽的樣子排 */
export function OverviewSkeleton() {
  return (
    <LoadingState label="載入總覽…" className="page-stack">
      <SummarySkeleton label={null} />
      <div className={OVERVIEW_COLUMNS}>
        <div className={OVERVIEW_LEFT}>
          <AccountsSkeleton label={null} />
        </div>
        <div className={OVERVIEW_RIGHT}>
          <ExpenseSkeleton label={null} />
          <TrendSkeleton label={null} />
        </div>
      </div>
    </LoadingState>
  );
}
