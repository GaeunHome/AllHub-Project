import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { ListSkeleton } from "@/core/ui/skeleton";
import { AddGoalForm } from "../components/goal-forms";
import { GoalList } from "../components/goal-list";
import { History, HistorySkeleton } from "../components/history";
import type { SearchParams } from "../components/month-href";
import { MonthRecords, MonthRecordsSkeleton } from "../components/month-records";
import { SummaryCards, SummaryCardsSkeleton } from "../components/summary-cards";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function SavingsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} subtitle={info.description} />
        <Suspense fallback={<SummaryCardsSkeleton />}>
          <SummaryCards />
        </Suspense>
      </section>

      <section>
        <SectionTitle icon="piggy-bank">每月固定項目</SectionTitle>
        <div className="flex flex-col gap-4">
          <Suspense fallback={<ListSkeleton rows={3} label="載入固定項目…" />}>
            <GoalList />
          </Suspense>
          <AddGoalForm />
        </div>
      </section>

      <section>
        <Suspense fallback={<MonthRecordsSkeleton />}>
          <MonthRecords searchParams={searchParams} />
        </Suspense>
      </section>

      <section>
        <SectionTitle icon="chart-column">歷史</SectionTitle>
        <Suspense fallback={<HistorySkeleton />}>
          <History searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
