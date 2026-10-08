import { youtubeInfo } from "@/modules/youtube/info";
import { WatchPage } from "@/modules/youtube/web/pages/watch-page";

// 翻譯的 Server Action 在這個頁面執行，每次在 40 秒預算內翻幾批，函式時限至少要 60 秒
export const maxDuration = 60;

export default function Page({ params }: PageProps<"/youtube/watch/[videoId]">) {
  return <WatchPage params={params} info={youtubeInfo} />;
}
