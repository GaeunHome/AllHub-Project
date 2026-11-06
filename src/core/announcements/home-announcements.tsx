import { connection } from "next/server";
import { requireSession } from "../auth";
import type { AnnouncementKind, CoreAnnouncement } from "../db/schema";
import { Icon, type UiIconName } from "../ui/icon";
import { CardHeader } from "../ui/page-header";
import { SceneImage } from "../ui/scene";
import { AnnouncementChip } from "./announcement-chip";
import { cachedAnnouncements } from "./cached";
import { announcementWhen, importantFirst, isAnnouncementShown } from "./rules";

const KIND_ICONS: Record<AnnouncementKind, UiIconName> = { outage: "circle-alert", maintenance: "wrench", general: "info" };

function Heading({ row }: { row: CoreAnnouncement }) {
  return (
    <>
      <span className="icon-tile announcement-tile">
        <Icon name={KIND_ICONS[row.kind]} />
      </span>
      <span className="min-w-0 font-medium break-words text-ink [grid-area:title]">{row.title}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [grid-area:meta]">
        <AnnouncementChip kind={row.kind} />
        <span className="text-ink-soft tabular-nums">{announcementWhen(row)}</span>
      </span>
    </>
  );
}

/** 首頁最下面 沒有公告時整區不出現 沒有內文的不用點開 */
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
      <ul className="card-list announcement-list">
        {importantFirst(shown).map((row) => (
          <li key={row.id} data-kind={row.kind}>
            {row.body === "" ? (
              <p className="card-row announcement-row">
                <Heading row={row} />
              </p>
            ) : (
              <details className="announcement">
                <summary className="card-row announcement-row">
                  <Heading row={row} />
                </summary>
                <p className="announcement-body">{row.body}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
