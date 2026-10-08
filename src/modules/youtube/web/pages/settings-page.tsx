import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { BackLink } from "@/core/ui/back-link";
import { Icon } from "@/core/ui/icon";
import { PageHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { cachedSettingsView } from "../../service/cached";
import { SettingsForm } from "../components/settings-form";

async function SettingsLoader() {
  await requireSession();
  return <SettingsForm settings={await cachedSettingsView()} />;
}

function SettingsSkeleton() {
  return (
    <LoadingState className="flex flex-col gap-6">
      <div className="card flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-2xl" />
          ))}
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card flex flex-col gap-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
          <Skeleton className="h-11 rounded-full" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
          <Skeleton className="h-11 rounded-full" />
        </div>
      ))}
    </LoadingState>
  );
}

export function SettingsPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-5">
      <BackLink href={info.href}>{info.name}</BackLink>
      <PageHeader
        icon={<Icon name="languages" />}
        title="翻譯設定"
        subtitle="API Key 會加密後存進資料庫，這裡只顯示末 4 碼。只有在你打開觀看頁播放影片（自動即時翻譯）或按「開始翻譯」時才會使用、才會產生費用；新影片通知不會自動翻譯。"
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsLoader />
      </Suspense>
    </div>
  );
}
