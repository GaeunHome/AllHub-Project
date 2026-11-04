import { HomePage } from "@/core/ui/home-page";
import { modules } from "@/modules";
import { remindersInfo } from "@/modules/reminders/info";
import { RemindersHomeCard } from "@/modules/reminders/web/pages/home-card";
import { RemindersNotices } from "@/modules/reminders/web/pages/home-notices";
import { savingsInfo } from "@/modules/savings/info";
import { SavingsHomeCard } from "@/modules/savings/web/pages/home-card";
import { SavingsNotices } from "@/modules/savings/web/pages/home-notices";
import { starrailInfo } from "@/modules/starrail/info";
import { travelInfo } from "@/modules/travel/info";
import { TravelHomeCard } from "@/modules/travel/web/pages/home-card";
import { StarrailHomeCard } from "@/modules/starrail/web/pages/home-card";
import { StarrailNotices } from "@/modules/starrail/web/pages/home-notices";
import { twitchInfo } from "@/modules/twitch/info";
import { TwitchHomeCard } from "@/modules/twitch/web/pages/home-card";
import { youtubeInfo } from "@/modules/youtube/info";
import { weatherInfo } from "@/modules/weather/info";
import { WeatherHomeCard } from "@/modules/weather/web/pages/home-card";
import { YoutubeHomeCard } from "@/modules/youtube/web/pages/home-card";

export default function Page() {
  return (
    <HomePage
      modules={modules}
      notices={[
        { id: savingsInfo.id, card: <SavingsNotices /> },
        { id: remindersInfo.id, card: <RemindersNotices /> },
        { id: starrailInfo.id, card: <StarrailNotices /> },
      ]}
      top={[
        { id: weatherInfo.id, card: <WeatherHomeCard info={weatherInfo} /> },
        { id: remindersInfo.id, card: <RemindersHomeCard info={remindersInfo} /> },
      ]}
      wide={[
        { id: twitchInfo.id, card: <TwitchHomeCard info={twitchInfo} /> },
        { id: youtubeInfo.id, card: <YoutubeHomeCard info={youtubeInfo} /> },
      ]}
      half={[{ id: starrailInfo.id, card: <StarrailHomeCard info={starrailInfo} /> }]}
      compact={[
        { id: savingsInfo.id, card: <SavingsHomeCard info={savingsInfo} /> },
        { id: travelInfo.id, card: <TravelHomeCard info={travelInfo} /> },
      ]}
    />
  );
}
