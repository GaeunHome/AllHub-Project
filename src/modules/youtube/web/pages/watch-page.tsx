import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { BackLink } from "@/core/ui/back-link";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { parseVideoId } from "../../lib/parse";
import { cachedMissingApiKeyMessage, cachedTranslation, cachedVideoTitle } from "../../service/cached";
import { progressOf } from "../../service/translation";
import { WatchClient } from "../components/watch-client";

async function WatchLoader({ params, info }: { params: Promise<{ videoId: string }>; info: ModuleInfo }) {
  await requireSession();
  const videoId = parseVideoId((await params).videoId);
  if (!videoId) notFound();

  const translation = await cachedTranslation(videoId);
  // 已經翻完的影片用不到金鑰，不必提示
  const apiKeyMissing = translation?.status === "done" ? null : await cachedMissingApiKeyMessage();
  const title = translation?.title ?? (await cachedVideoTitle(videoId)) ?? videoId;

  return (
    <>
      <header className="flex items-center gap-3">
        {info.icon && (
          <span className="icon-tile size-11 rounded-2xl">
            <Icon src={info.icon} />
          </span>
        )}
        <h1 className="min-w-0 text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
      </header>
      <WatchClient
        videoId={videoId}
        // 翻譯狀態在伺服器端改變（開始、上傳、重試）後，翻譯面板依這個值重新掛載、從新狀態開始
        translationKey={`${translation?.id ?? "none"}-${translation?.updatedAt.getTime() ?? 0}`}
        translation={translation ? { ...progressOf(translation), cues: translation.sourceCues, sourceKind: translation.sourceKind } : null}
        apiKeyMissing={apiKeyMissing}
        settingsHref={`${info.href}/settings`}
      />
    </>
  );
}

function WatchSkeleton() {
  return (
    <LoadingState className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0 rounded-2xl" />
        <Skeleton className="h-7 w-2/3" />
      </div>
      <Skeleton className="aspect-video w-full rounded-3xl" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <div className="card flex flex-col gap-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-9 w-48 rounded-full" />
      </div>
    </LoadingState>
  );
}

// 圖示與點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function WatchPage({ params, info }: { params: Promise<{ videoId: string }>; info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-5">
      <BackLink href={info.href}>{info.name}</BackLink>
      <Suspense fallback={<WatchSkeleton />}>
        <WatchLoader params={params} info={info} />
      </Suspense>
    </div>
  );
}
