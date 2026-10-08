import { youtubeInfo } from "@/modules/youtube/info";
import { YoutubePage } from "@/modules/youtube/web/pages/youtube-page";

export default function Page() {
  return <YoutubePage info={youtubeInfo} />;
}
