import { connection } from "next/server";
import { requireSession } from "../auth";
import { Icon } from "../ui/icon";
import { CardHeader } from "../ui/page-header";
import { SceneImage } from "../ui/scene";
import { AnnouncementRows } from "./announcement-rows";
import { cachedAnnouncements } from "./cached";
import { isAnnouncementShown } from "./rules";

/** 首頁最下面 沒有公告時整區不出現 內文在各自的公告頁 */
export async function HomeAnnouncements() {
  await requireSession();
  // 結束時間過了要馬上不見 所以用這次請求的時間算
  await connection();
  const now = new Date();
  const shown = (await cachedAnnouncements()).filter((row) => isAnnouncementShown(row, now));
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="home-announcements" className="card stack min-w-0">
      <div className="card-art scene">
        <SceneImage src="/images/scenes/banner-announcements.svg" />
        <CardHeader id="home-announcements" icon={<Icon name="megaphone" />}>
          公告
        </CardHeader>
      </div>
      <AnnouncementRows rows={shown} />
    </section>
  );
}
