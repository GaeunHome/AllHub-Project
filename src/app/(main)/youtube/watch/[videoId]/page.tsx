import { youtubeInfo } from "@/modules/youtube/info";
import { WatchPage } from "@/modules/youtube/web/pages/watch-page";

// 翻譯的 Server Action 在這頁執行 每次用 40 秒預算翻幾批 時限至少要 60 秒
export const maxDuration = 60;

export default function Page({ params }: PageProps<"/youtube/watch/[videoId]">) {
  return <WatchPage params={params} info={youtubeInfo} />;
}
