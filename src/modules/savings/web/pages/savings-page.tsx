import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { EntryDetails, EntryDetailsSkeleton } from "../components/entry-details";
import { AddGoalForm } from "../components/goal-forms";
import { GoalList } from "../components/goal-list";
import type { SearchParams } from "../components/month-href";
import { MonthPanel, MonthPanelSkeleton } from "../components/month-panel";
import { SectionDisclosure } from "../components/section-disclosure";
import { Statistics, StatisticsSkeleton } from "../components/statistics";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
// 重點先顯示（本月總覽、項目清單），次要的（紀錄明細、統計、管理項目）收在預設關著的區塊
export function SavingsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} />

      <Suspense fallback={<MonthPanelSkeleton />}>
        <MonthPanel searchParams={searchParams} />
      </Suspense>

      <div className="card divide-y divide-line p-0">
        <SectionDisclosure icon="list-video" title="紀錄明細">
          <Suspense fallback={<EntryDetailsSkeleton />}>
            <EntryDetails searchParams={searchParams} />
          </Suspense>
        </SectionDisclosure>
        <SectionDisclosure icon="chart-column" title="統計">
          <Suspense fallback={<StatisticsSkeleton />}>
            <Statistics searchParams={searchParams} />
          </Suspense>
        </SectionDisclosure>
        <SectionDisclosure icon="settings" title="管理項目">
          <div className="stack">
            <Suspense fallback={<GoalListSkeleton />}>
              <GoalList />
            </Suspense>
            <AddGoalForm />
          </div>
        </SectionDisclosure>
      </div>
    </div>
  );
}

function GoalListSkeleton() {
  return (
    <LoadingState label="載入固定項目…" className="flex flex-col divide-y divide-line sm:rounded-xl sm:border sm:border-line">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 sm:px-4 sm:first:pt-3 sm:last:pb-3">
          <Skeleton className={`h-5 ${i === 1 ? "w-1/4" : "w-1/3"}`} />
          <Skeleton className="ml-auto h-11 w-48 rounded-lg" />
        </div>
      ))}
    </LoadingState>
  );
}
