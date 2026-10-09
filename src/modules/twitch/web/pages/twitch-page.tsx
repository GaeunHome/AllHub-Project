import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { LogListSkeleton } from "@/core/ui/skeleton";
import { AddStreamerForm } from "../components/add-streamer-form";
import { Following, FollowingSkeleton } from "../components/following";
import { RecentEvents } from "../components/recent-events";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
// theme-twitch 讓這一頁不論全站淺色或深色，都是 Twitch 網站的深色風格；手機上滿版，寬螢幕是圓角的深色面板
export function TwitchPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="theme-twitch page-stack -mx-4 -mt-6 -mb-16 px-4 pt-6 pb-16 sm:m-0 sm:rounded-2xl sm:border sm:border-line sm:p-6 lg:p-8">
      <section className="stack">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} />
        <AddStreamerForm />
      </section>

      <Suspense fallback={<FollowingSkeleton />}>
        <Following />
      </Suspense>

      <section aria-labelledby="tw-events" className="stack">
        <SectionTitle id="tw-events" icon="radio">
          最近的開關台紀錄
        </SectionTitle>
        <Suspense fallback={<LogListSkeleton className="rounded-lg" />}>
          <RecentEvents />
        </Suspense>
      </section>
    </div>
  );
}
