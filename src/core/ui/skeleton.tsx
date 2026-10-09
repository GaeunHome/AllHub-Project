import type { ReactNode } from "react";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={className ? `skeleton ${className}` : "skeleton"} />;
}

// 骨架本身沒有文字，外層補上 role="status" 與隱藏文字，報讀器才知道正在載入
export function LoadingState({ label = "載入中…", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

type ListSkeletonProps = { rows?: number; label?: string };

/** 卡片裡撐滿左右的清單（card-list）還在載入：放在卡片的標題列下面 */
export function ListSkeleton({ rows = 3, label }: ListSkeletonProps) {
  return (
    <LoadingState label={label} className="card-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-row flex items-center gap-3">
          <Skeleton className="hidden size-9 shrink-0 rounded-xl sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
        </div>
      ))}
    </LoadingState>
  );
}

/** 只有一則一則紀錄的卡片（通知、開關台）還在載入；列的內距跟卡片一樣（card-row），主題頁可以加上自己的外框樣式 */
export function LogListSkeleton({ rows = 4, label, className = "" }: ListSkeletonProps & { className?: string }) {
  return (
    <LoadingState label={label} className={`card divide-y divide-line p-0 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-row flex items-start gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-32" : "w-24"}`} />
              <Skeleton className="ml-auto h-3 w-24" />
            </div>
            <Skeleton className={`h-3.5 ${i % 2 === 0 ? "w-1/2" : "w-1/3"}`} />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}

export function CardGridSkeleton({ cards = 2, label }: { cards?: number; label?: string }) {
  return (
    <LoadingState label={label} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      ))}
    </LoadingState>
  );
}
