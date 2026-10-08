import Link from "next/link";
import { Suspense } from "react";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { CardGridSkeleton, ListSkeleton } from "@/core/ui/skeleton";
import { AddChannelForm } from "../components/add-channel-form";
import { ChannelList } from "../components/channel-list";
import { OpenVideoForm } from "../components/open-video-form";
import { RecentVideos } from "../components/recent-videos";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function YoutubePage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <PageHeader
          icon={info.icon && <Icon src={info.icon} />}
          title={info.name}
          subtitle={info.description}
          actions={
            <Link href="/youtube/settings" className="btn-secondary">
              <Icon name="settings" className="size-4" />
              翻譯設定
            </Link>
          }
        />
        <AddChannelForm />
        <OpenVideoForm />
      </section>

      <section>
        <SectionTitle icon="list-video">最新影片</SectionTitle>
        <Suspense fallback={<ListSkeleton />}>
          <RecentVideos />
        </Suspense>
      </section>

      <section>
        <SectionTitle icon="users">追蹤中的頻道</SectionTitle>
        <Suspense fallback={<CardGridSkeleton />}>
          <ChannelList />
        </Suspense>
      </section>
    </div>
  );
}
