import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { HomeCard } from "@/core/ui/home-card";
import { pickLiveNow } from "../../lib/visuals";
import { LiveNowList, LiveNowSkeleton, NoFollowedStreamers } from "../components/live-now";
import { followedStreamerVisuals } from "../streamer-visuals";

// 名稱、圖示、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function TwitchHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="正在直播" skeleton={<LiveNowSkeleton />}>
      <LiveNow />
    </HomeCard>
  );
}

/** 自己追蹤、正在直播的主播；沒有 Twitch 憑證時 Helix 都是 null，照 EventSub 記下的開台狀態列出，不顯示錯誤 */
export async function LiveNow() {
  const user = await requireSession();
  const visuals = await followedStreamerVisuals(user.id);
  if (visuals.length === 0) return <NoFollowedStreamers />;
  const { shown, more } = pickLiveNow(visuals);
  return <LiveNowList streamers={shown} more={more} now={new Date()} />;
}
