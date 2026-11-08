import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { PageTheme } from "@/core/ui/page-theme";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { cachedChannels, cachedRecentVideos, cachedSavedVideos } from "../../service/cached";
import { ChannelSidebar } from "../components/channel-sidebar";
import { VideoCard } from "../components/video-card";
import { VideoFeed } from "../components/video-feed";
import { YoutubeSearchBar } from "../components/youtube-search-bar";
import { videoFilters } from "../video-filter";

/** 寬螢幕一排最多 4 支 這一排的縮圖常常是 LCP 不延遲載入 */
const FIRST_ROW = 4;

// web 不能 import 模組根目錄 info 由 src/app 傳進來
// 配色照 YouTube 網站的淺色與深色
export function YoutubePage({ info }: { info: ModuleInfo }) {
  return (
    <PageTheme accent={info.accent} className="theme-youtube page-stack">
      {/* 靠上對齊 搜尋列下方出現訊息時 標誌與設定鈕才不會往下移 三者都是 44px 高 */}
      <header className="flex flex-wrap items-start gap-x-6 gap-y-4 sm:flex-nowrap">
        <YoutubeLogo info={info} />
        <div className="order-last w-full sm:order-none sm:mx-auto sm:w-auto sm:max-w-xl sm:flex-1">
          <YoutubeSearchBar />
        </div>
        {/* 手機上只有圖示 按鈕是正方形 */}
        <Link href={`${info.href}/settings`} className="yt-pill ml-auto w-11 px-0 sm:ml-0 sm:w-auto sm:px-4" aria-label="翻譯設定">
          <Icon name="settings" className="size-[1.125rem]" />
          <span className="hidden sm:inline">翻譯設定</span>
        </Link>
      </header>
      <Suspense fallback={<YoutubeHomeSkeleton />}>
        <YoutubeHome />
      </Suspense>
    </PageTheme>
  );
}

/** 跟 YouTube 一樣是紅色標誌加字樣 頁面標題就是它 */
function YoutubeLogo({ info }: { info: ModuleInfo }) {
  return (
    <h1 className="yt-logo">
      <span className="yt-logo-mark"><Icon src={info.icon} className="h-7 w-9" /></span>
      {info.name}
    </h1>
  );
}

export async function YoutubeHome() {
  const user = await requireModule("youtube");
  const [channels, videos, saved] = await Promise.all([cachedChannels(user.id), cachedRecentVideos(user.id), cachedSavedVideos(user.id)]);
  const now = new Date();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <ChannelSidebar channels={channels} savedCount={saved.length} />
      {videos.length === 0 ? (
        <EmptyState icon="clapperboard" title="還沒有影片" hint="追蹤頻道後會先補上最近的影片，之後一有新影片就會出現在這裡" />
      ) : (
        <VideoFeed items={videos.map((video, i) => ({ id: video.videoId, filters: videoFilters(video), card: <VideoCard video={video} now={now} eager={i < FIRST_ROW} /> }))} />
      )}
    </div>
  );
}

/** 跟載入完成的版面一樣 有側欄 篩選膠囊與卡片 手機的側欄是頭像列 */
function YoutubeHomeSkeleton() {
  return (
    <LoadingState label="載入影片中…" className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="stack min-w-0">
        {/* 已保留的入口 */}
        <Skeleton className="h-11 w-full rounded-lg lg:h-10" />
        <div className="flex gap-4 overflow-hidden lg:flex-col lg:gap-3">
          <Skeleton className="hidden h-6 w-20 lg:block" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-1.5 lg:flex-row lg:gap-3">
              <Skeleton className="size-16 rounded-full lg:size-6" />
              <Skeleton className="h-3.5 w-14 lg:w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="stack">
        <div className="flex gap-2">
          {["w-14", "w-24", "w-20", "w-20"].map((width, i) => (
            <Skeleton key={i} className={`h-9 rounded-lg ${width}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="-mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-xl" />
              <div className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingState>
  );
}
