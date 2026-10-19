import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { BackLink } from "@/core/ui/back-link";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { PageTheme } from "@/core/ui/page-theme";
import { PageHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { YOUTUBE_PAGE_PATH } from "../../lib/urls";
import { cachedSavedVideos, cachedVideoInfo } from "../../service/cached";
import { SAVED_LIMIT, type SavedVideo } from "../../service/saved-videos";
import { SavedVideoCard } from "../components/saved-video-card";
import { SavedVideoList } from "../components/saved-video-list";

/** 寬螢幕一排最多 5 部 這一排的縮圖常常是 LCP 不延遲載入 */
const FIRST_ROW = 5;

/** 保留時沒讀到標題或頻道的再試一次 oEmbed 讀過的有快取 還是沒有就顯示影片 id */
async function withNames(videos: SavedVideo[]): Promise<SavedVideo[]> {
  return Promise.all(
    videos.map(async (video) => {
      if (video.title && video.channelTitle) return video;
      const info = await cachedVideoInfo(video.videoId);
      return { ...video, title: video.title ?? info?.title ?? null, channelTitle: video.channelTitle ?? info?.channelName ?? null };
    }),
  );
}

export async function SavedVideosLoader() {
  const user = await requireSession();
  const videos = await withNames(await cachedSavedVideos(user.id));
  if (videos.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="還沒有保留的影片"
        hint={`在觀看頁按頻道名稱旁的「保留」，按過翻譯的影片也會自動加進來（最多 ${SAVED_LIMIT} 部）`}
        action={
          <Link href={YOUTUBE_PAGE_PATH} className="btn-secondary">
            回 YouTube 找影片
          </Link>
        }
      />
    );
  }

  const now = new Date();
  return (
    <SavedVideoList
      limit={SAVED_LIMIT}
      items={videos.map((video, i) => ({
        id: video.videoId,
        // 篩選的文字跟卡片上看到的一樣 沒有標題時是影片 id
        text: [video.title ?? video.videoId, video.channelTitle].filter(Boolean).join(" "),
        card: <SavedVideoCard video={video} now={now} eager={i < FIRST_ROW} />,
      }))}
    />
  );
}

/** 跟載入完成的版面一樣 有搜尋框 數量與卡片格子 */
function SavedSkeleton() {
  return (
    <LoadingState label="載入已保留的影片…" className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Skeleton className="h-11 min-w-0 flex-1 basis-64 rounded-lg sm:max-w-md" />
        <Skeleton className="h-[1.375rem] w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex flex-col gap-3 ${i > 0 ? "hidden sm:flex" : ""}`}>
            <Skeleton className="-mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

// 圖示 名稱與點綴色由 src/app 從 info.ts 傳進來 web 層不能 import 根目錄
// 跟列表頁一樣照 YouTube 的淺色與深色
export function SavedVideosPage({ info }: { info: ModuleInfo }) {
  return (
    <PageTheme accent={info.accent} className="theme-youtube page-stack">
      {/* 返回連結 標題與說明是同一組 組內 gap-4 下面的清單是另一個區塊 */}
      <div className="stack">
        <BackLink href={info.href}>{info.name}</BackLink>
        <PageHeader icon={<Icon name="bookmark" />} title="已保留的影片" />
        <details className="disclosure text-sm">
          <summary>怎麼加進來、滿了會怎樣？</summary>
          <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed text-ink-soft">
            <li>在觀看頁按頻道名稱旁的「保留」；按過翻譯（開始翻譯、用我的 API Key 繼續翻譯、重試、重新翻譯、上傳字幕）的影片也會自動加進來，標成「翻譯過」。</li>
            <li>
              每個人最多 {SAVED_LIMIT} 部。滿了以後，新的影片會先擠掉最舊的「翻譯過」；{SAVED_LIMIT} 部都是手動保留的，要先移除一部才能再保留，翻譯時也不會再自動加入。
            </li>
            <li>移除只是從清單拿掉：翻譯好的字幕會留著，之後打開同一支影片還看得到。</li>
          </ul>
        </details>
      </div>
      <Suspense fallback={<SavedSkeleton />}>
        <SavedVideosLoader />
      </Suspense>
    </PageTheme>
  );
}
