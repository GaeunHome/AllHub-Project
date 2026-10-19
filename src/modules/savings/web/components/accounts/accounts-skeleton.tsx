import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ACCOUNTS_GRID } from "../dashboard/layout";

// 跟載入完成的卡片差不多高 串流進來時下面的區塊才不會跳

function DepositSkeleton() {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-9 w-36" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="card flex flex-col gap-4">
      <Skeleton className="aspect-[1.586] w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export function AccountsPageSkeleton() {
  return (
    <LoadingState label="載入帳戶…" className="page-stack">
      <div className="stack">
        <Skeleton className="h-7 w-16" />
        <div className={ACCOUNTS_GRID}>
          {[0, 1, 2].map((i) => (
            <DepositSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="stack">
        <Skeleton className="h-7 w-20" />
        <div className={ACCOUNTS_GRID}>
          {[0, 1].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </LoadingState>
  );
}
