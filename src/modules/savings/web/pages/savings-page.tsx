import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { DialogMessageScope } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { PageHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { EntryDetails, EntryDetailsSkeleton } from "../components/entry-details";
import { AddGoalDialog } from "../components/goal-forms";
import { GoalList } from "../components/goal-list";
import type { SearchParams } from "../components/month-href";
import { MonthPanel, MonthPanelSkeleton } from "../components/month-panel";
import { SectionDisclosure } from "../components/section-disclosure";
import { Statistics, StatisticsSkeleton } from "../components/statistics";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
// 重點先顯示（本月總覽、項目清單），次要的（紀錄明細、統計、管理項目）收在預設關著的區塊
export function SavingsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    // 記一筆、臨時存款、修改、新增都會留下成功訊息：同一頁只留最新一則
    <DialogMessageScope>
      {/* 寬螢幕：總覽與項目清單在左、收起來的區塊在右，金額與輸入框不會拉到整個畫面寬 */}
      <div data-accent={info.accent} className="page-stack xl:grid xl:grid-cols-2 xl:items-start xl:[&>:first-child]:col-span-2">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} />

        {/* 總覽與項目清單是兩張卡片，包成左邊一欄；串流中的 Suspense 會在原地多一個 template，不靠第幾個子元素排 */}
        <div className="page-stack">
          <Suspense fallback={<MonthPanelSkeleton />}>
            <MonthPanel searchParams={searchParams} />
          </Suspense>
        </div>

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
              <AddGoalDialog />
            </div>
          </SectionDisclosure>
        </div>
      </div>
    </DialogMessageScope>
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
