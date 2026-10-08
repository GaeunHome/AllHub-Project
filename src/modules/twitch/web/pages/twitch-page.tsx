import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { CardGridSkeleton, LogListSkeleton } from "@/core/ui/skeleton";
import { AddStreamerForm } from "../components/add-streamer-form";
import { RecentEvents } from "../components/recent-events";
import { StreamerList } from "../components/streamer-list";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function TwitchPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} subtitle={info.description} />
        <AddStreamerForm />
      </section>

      <section>
        <SectionTitle icon="users">追蹤中的主播</SectionTitle>
        <Suspense fallback={<CardGridSkeleton />}>
          <StreamerList />
        </Suspense>
      </section>

      <section>
        <SectionTitle icon="radio">最近的開關台紀錄</SectionTitle>
        <Suspense fallback={<LogListSkeleton />}>
          <RecentEvents />
        </Suspense>
      </section>
    </div>
  );
}
