import { youtubeInfo } from "@/modules/youtube/info";
import { SettingsPage } from "@/modules/youtube/web/pages/settings-page";

export default function Page() {
  return <SettingsPage info={youtubeInfo} />;
}
