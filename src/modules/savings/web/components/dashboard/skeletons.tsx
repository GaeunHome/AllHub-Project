import type { ReactNode } from "react";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { BIG_FIGURE, BIG_FIGURE_FACTS, OVERVIEW_COLUMNS, OVERVIEW_LEFT, OVERVIEW_RIGHT, OVERVIEW_TOP } from "./layout";

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

const Header = () => (
  <div className="flex min-h-9 items-center justify-between gap-3">
    <Skeleton className="h-7 w-28" />
    <Skeleton className="h-5 w-16" />
  </div>
);

/** 跟 FactList 一樣高 每個寬度一列 */
export function FactsSkeleton({ widths, className = "" }: { widths: string[]; className?: string }) {
  return (
    <div className={`flex flex-col divide-y divide-line ${className}`.trim()}>
      {widths.map((width, i) => (
        <div key={i} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className={`h-5 ${width}`} />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton({ label = "載入總資產…" }: SkeletonProps) {
  return (
    <Frame label={label} className={`fin-hero card ${BIG_FIGURE}`}>
      <div className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-10 w-56 max-w-full sm:h-12" />
      </div>
      <FactsSkeleton widths={["w-24", "w-24", "w-20"]} className={BIG_FIGURE_FACTS} />
    </Frame>
  );
}

export function QuickActionsSkeleton({ label = "載入常用的動作…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack @container min-w-0">
      <Skeleton className="h-7 w-16" />
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="min-h-14 rounded-xl @2xl:min-h-24" />
        ))}
      </div>
    </Frame>
  );
}

export function ChecklistSkeleton({ label = "載入這個月要做的事…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack min-w-0">
      <Header />
      <div className="card-list">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-row flex items-center gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-32" : "w-24"}`} />
              <Skeleton className="h-3.5 w-40 max-w-full" />
            </div>
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function MonthSkeleton({ label = "載入本月收支…" }: SkeletonProps) {
  return (
    <Frame label={label} className="card stack min-w-0">
      <Header />
      <FactsSkeleton widths={["w-24", "w-20", "w-20"]} />
      <div className="card-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-row flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-1.5 rounded-full" />
            </div>
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
      <div className={OVERVIEW_TOP}>
        <HeroSkeleton label={null} />
        <QuickActionsSkeleton label={null} />
      </div>
      <div className={OVERVIEW_COLUMNS}>
        <div className={OVERVIEW_LEFT}>
          <ChecklistSkeleton label={null} />
        </div>
        <div className={OVERVIEW_RIGHT}>
          <MonthSkeleton label={null} />
          <TrendSkeleton label={null} />
        </div>
      </div>
    </LoadingState>
  );
}
