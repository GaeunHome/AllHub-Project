import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { BackLink } from "@/core/ui/back-link";
import { PageTheme } from "@/core/ui/page-theme";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { parseVideoId } from "../../lib/parse";
import { cachedMissingApiKeyMessage, cachedTranslation, cachedVideoTitle } from "../../service/cached";
import { canManageTranslation, progressOf } from "../../service/translation";
import { PlayerSizeSync } from "../components/player-size-sync";
import { UpNext, UpNextSkeleton } from "../components/up-next";
import { WatchClient } from "../components/watch-client";
import { WatchChannel, WatchChannelFallback, WatchTitle, WatchTitleText } from "../components/watch-heading";

/** 翻譯所有人共用：誰打開都看得到同一份；接著翻用自己的 API Key，重新翻譯與換字幕只有發起人或站長能做 */
export async function WatchLoader({ params, info }: { params: Promise<{ videoId: string }>; info: ModuleInfo }) {
  const user = await requireSession();
  const videoId = parseVideoId((await params).videoId);
  if (!videoId) notFound();

  const translation = await cachedTranslation(videoId);
  // 已經翻完的影片用不到金鑰，不必提示
  const apiKeyMissing = translation?.status === "done" ? null : await cachedMissingApiKeyMessage(user.id);
  const title = translation?.title ?? (await cachedVideoTitle(user.id, videoId)) ?? videoId;

  return (
    <WatchClient
      videoId={videoId}
      // 標題與頻道頭像要向 YouTube 讀，各自放進 Suspense：播放器不必等它們
      title={
        <Suspense fallback={<WatchTitleText title={title} />}>
          <WatchTitle videoId={videoId} title={title} />
        </Suspense>
      }
      channel={
        <Suspense fallback={<WatchChannelFallback icon={info.icon} />}>
          <WatchChannel videoId={videoId} />
        </Suspense>
      }
      // 翻譯狀態在伺服器端改變（開始、上傳、重試）後，翻譯面板依這個值重新掛載、從新狀態開始
      translationKey={`${translation?.id ?? "none"}-${translation?.updatedAt.getTime() ?? 0}`}
      translation={translation ? { ...progressOf(translation), cues: translation.sourceCues, sourceKind: translation.sourceKind } : null}
      apiKeyMissing={apiKeyMissing}
      // 還沒有翻譯時誰都可以開始或上傳；已經有了就只有發起人或站長能蓋掉
      canManage={translation ? canManageTranslation(user, translation) : true}
      // 別人發起、還沒翻完的翻譯不自動用觀看者的 API Key 接著翻，要他自己按（站長也一樣）
      startedByViewer={translation?.requestedBy === user.id}
      settingsHref={`${info.href}/settings`}
    />
  );
}

/** 跟載入完成的版面一樣：播放器、標題、頻道列與膠囊按鈕、說明欄 */
function WatchSkeleton() {
  return (
    // 外層跟 WatchClient 一樣是播放器加下面一疊：劇院模式時一起拆開，標題排到下一列
    <div className="stack min-w-0">
      {/* 跟播放器佔同一個位置（.player-slot）：劇院模式、手機撐滿寬度時骨架的大小與位置也一樣，換成播放器時不會跳 */}
      <Skeleton className="player-slot rounded-2xl max-sm:rounded-none" />
      <LoadingState className="stack min-w-0">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
      </LoadingState>
    </div>
  );
}

// 圖示與點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
// 照 YouTube 的觀看頁：播放器與翻譯在左，寬螢幕右側是「接下來播放」（手機排在下面）
export function WatchPage({ params, info }: { params: Promise<{ videoId: string }>; info: ModuleInfo }) {
  return (
    <PageTheme accent={info.accent} className="theme-youtube flex flex-col gap-4">
      <BackLink href={info.href}>{info.name}</BackLink>
      {/* 播放器大小優先：寬螢幕上寬度依視窗高度封頂（照 YouTube），最少佔一半，多出來的寬度給「接下來播放」；預留的高度算到一行標題與頻道列，視窗不夠高（播放器窄、膠囊會換到第二列）時多留那一列；劇院模式時播放器撐滿兩欄、其他排到下一列 */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-y-4 xl:grid-cols-[minmax(0,max(50%,calc((100dvh-20.25rem)*16/9)))_minmax(22rem,1fr)] xl:[@media(min-height:54rem)]:grid-cols-[minmax(0,max(50%,calc((100dvh-17rem)*16/9)))_minmax(22rem,1fr)]">
        {/* 劇院模式存在瀏覽器：整頁載入時在播放器與骨架之前先標好，第一次繪製就是劇院模式 */}
        <PlayerSizeSync />
        <Suspense fallback={<WatchSkeleton />}>
          <WatchLoader params={params} info={info} />
        </Suspense>
        <Suspense fallback={<UpNextSkeleton />}>
          <UpNext params={params} />
        </Suspense>
      </div>
    </PageTheme>
  );
}
