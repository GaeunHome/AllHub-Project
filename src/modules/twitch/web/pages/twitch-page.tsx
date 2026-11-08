import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { PageTheme } from "@/core/ui/page-theme";
import { LogListSkeleton } from "@/core/ui/skeleton";
import { AddStreamerForm } from "../components/add-streamer-form";
import { Following, FollowingSkeleton } from "../components/following";
import { RecentEvents } from "../components/recent-events";

// web 不能 import 模組根目錄 info 由 src/app 傳進來
// 超寬螢幕時開台紀錄像聊天室移到右邊一欄
export function TwitchPage({ info }: { info: ModuleInfo }) {
  return (
    <PageTheme accent={info.accent} className="theme-twitch page-stack 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:items-start">
      <section className="stack 2xl:col-span-2">
        <PageHeader icon={<Icon src={info.icon} />} title={info.name} />
        {/* 輸入框不必拉到整個畫面寬 */}
        <div className="max-w-2xl">
          <AddStreamerForm />
        </div>
      </section>

      <Suspense fallback={<FollowingSkeleton />}>
        <Following />
      </Suspense>

      <section aria-labelledby="tw-events" className="stack">
        <SectionTitle id="tw-events" icon="radio">
          開台紀錄
        </SectionTitle>
        <Suspense fallback={<LogListSkeleton className="rounded-lg" />}>
          <RecentEvents />
        </Suspense>
      </section>
    </PageTheme>
  );
}
