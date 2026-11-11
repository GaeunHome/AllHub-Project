import Link from "next/link";
import type { CoreAnnouncement } from "../db/schema";
import { Icon } from "../ui/icon";
import { AnnouncementChip } from "./announcement-chip";
import { ANNOUNCEMENT_KIND_ICONS } from "./kind-icons";
import { announcementHref, announcementWhen, importantFirst } from "./rules";

/** 首頁的公告與公告頁的其他公告共用 每一則點了到自己的頁面 停止服務排最前面 */
export function AnnouncementRows({ rows }: { rows: readonly CoreAnnouncement[] }) {
  return (
    <ul className="card-list announcement-list">
      {importantFirst(rows).map((row) => (
        <li key={row.id} data-kind={row.kind}>
          <Link href={announcementHref(row.id)} className="card-row announcement-row">
            <span className="icon-tile announcement-tile">
              <Icon name={ANNOUNCEMENT_KIND_ICONS[row.kind]} />
            </span>
            <span className="min-w-0 font-medium break-words text-ink [grid-area:title]">{row.title}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [grid-area:meta]">
              <AnnouncementChip kind={row.kind} />
              <span className="text-ink-soft tabular-nums">{announcementWhen(row)}</span>
            </span>
            <Icon name="chevron-right" className="size-4 text-ink-soft [grid-area:mark]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
