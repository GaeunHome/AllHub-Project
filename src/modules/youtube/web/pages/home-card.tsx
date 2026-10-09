import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { HomeCard } from "@/core/ui/home-card";
import { cachedRecentVideos } from "../../service/cached";
import { LatestVideoList, LatestVideosSkeleton } from "../components/latest-videos";
import { latestVideos } from "../video-filter";

// 名稱、圖示、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function YoutubeHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="最新影片" skeleton={<LatestVideosSkeleton />}>
      <LatestVideos />
    </HomeCard>
  );
}

/** 跟 YouTube 頁讀同一份影片清單（同一個快取）；中文字幕的背景重新檢查只在 YouTube 頁做，首頁只讀不寫 */
export async function LatestVideos() {
  const user = await requireSession();
  const { shown, more } = latestVideos(await cachedRecentVideos(user.id));
  return <LatestVideoList videos={shown} more={more} now={new Date()} />;
}
