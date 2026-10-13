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
// 超寬螢幕時開關台紀錄移到右邊一欄（像 Twitch 的聊天室），不會被拉成一長條
export function TwitchPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="theme-twitch page-stack -mx-4 -mt-6 -mb-16 px-4 pt-6 pb-16 sm:m-0 sm:rounded-2xl sm:border sm:border-line sm:p-6 lg:p-8 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:items-start">
      <section className="stack 2xl:col-span-2">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} />
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
          最近的開關台紀錄
        </SectionTitle>
        <Suspense fallback={<LogListSkeleton className="rounded-lg" />}>
          <RecentEvents />
        </Suspense>
      </section>
    </div>
  );
}
