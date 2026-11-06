import type { AnnouncementKind } from "../db/schema";
import { ANNOUNCEMENT_KIND_LABELS } from "./rules";

const CHIPS: Record<AnnouncementKind, string> = { outage: "chip chip-danger", maintenance: "chip chip-warning", general: "chip" };

export function AnnouncementChip({ kind }: { kind: AnnouncementKind }) {
  return <span className={`${CHIPS[kind]} shrink-0`}>{ANNOUNCEMENT_KIND_LABELS[kind]}</span>;
}
