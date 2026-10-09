import { HomePage } from "@/core/ui/home-page";
import { modules } from "@/modules";
import { savingsInfo } from "@/modules/savings/info";
import { SavingsHomeCard } from "@/modules/savings/web/pages/home-card";
import { starrailInfo } from "@/modules/starrail/info";
import { StarrailHomeCard } from "@/modules/starrail/web/pages/home-card";
import { twitchInfo } from "@/modules/twitch/info";
import { TwitchHomeCard } from "@/modules/twitch/web/pages/home-card";
import { youtubeInfo } from "@/modules/youtube/info";
import { YoutubeHomeCard } from "@/modules/youtube/web/pages/home-card";

export default function Page() {
  return (
    <HomePage
      modules={modules}
      wide={
        <>
          <TwitchHomeCard info={twitchInfo} />
          <YoutubeHomeCard info={youtubeInfo} />
          <StarrailHomeCard info={starrailInfo} />
        </>
      }
      compact={<SavingsHomeCard info={savingsInfo} />}
    />
  );
}
