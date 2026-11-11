import type { AnnouncementKind } from "../db/schema";
import type { UiIconName } from "../ui/icon";

/** 首頁 公告頁與跑馬燈共用 種類不只靠顏色分 */
export const ANNOUNCEMENT_KIND_ICONS: Record<AnnouncementKind, UiIconName> = { outage: "circle-alert", maintenance: "wrench", general: "info" };
