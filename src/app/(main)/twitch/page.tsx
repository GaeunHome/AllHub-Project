import { twitchInfo } from "@/modules/twitch/info";
import { TwitchPage } from "@/modules/twitch/web/pages/twitch-page";

export default function Page() {
  return <TwitchPage info={twitchInfo} />;
}
