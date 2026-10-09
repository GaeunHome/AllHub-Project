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
  const user = await requireSession();
  return <SettingsForm settings={await cachedSettingsView(user.id)} />;
}

function SettingsSkeleton() {
  return (
    <LoadingState className="page-stack">
      <div className="card stack">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card stack">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="field">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
          <div className="field">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}

// 跟列表頁、觀看頁一樣是 YouTube 的淺色／深色
export function SettingsPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="theme-youtube page-stack">
      {/* 返回連結、標題與說明是同一組，組內 gap-4；下面的表單是另一個區塊 */}
      <div className="stack">
        <BackLink href={info.href}>{info.name}</BackLink>
        <PageHeader icon={<Icon name="languages" />} title="翻譯設定" />
        <details className="disclosure text-sm">
          <summary>API Key 怎麼保存、什麼時候會產生費用？</summary>
          <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed text-ink-soft">
            <li>API Key 每個人各自設定，會加密後才存進資料庫，畫面上只顯示末 4 碼；刪除帳號時一起刪除。</li>
            <li>翻譯好的字幕所有人共用：別人打開同一支影片時直接看得到，接著翻譯時用的是他自己的 API Key。</li>
            <li>只有在觀看頁播放影片（自動即時翻譯）或按「開始翻譯」時才會呼叫 AI、產生費用。</li>
            <li>新影片通知、排程與背景檢查都不會翻譯。</li>
          </ul>
        </details>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsLoader />
      </Suspense>
    </div>
  );
}
