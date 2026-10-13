import { youtubeInfo } from "@/modules/youtube/info";
import { SavedVideosPage } from "@/modules/youtube/web/pages/saved-page";

export default function Page() {
  return <SavedVideosPage info={youtubeInfo} />;
}
