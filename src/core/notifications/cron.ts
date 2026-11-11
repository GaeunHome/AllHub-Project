import "server-only";
import { announcementTags } from "../announcements/cache-tags";
import { cleanupAnnouncements } from "../announcements/service";
import { expiringTask } from "../cache";
import type { CronTask } from "../module";
import { notificationsTag } from "./cache-tags";
import { cleanupNotifications } from "./service";

/** 結束很久的公告也在這裡清 Hobby 的排程有條數上限 不另外佔一條 */
async function cleanupNoticesAndAnnouncements(): Promise<string> {
  return `${await cleanupNotifications()}，${await cleanupAnnouncements()}`;
}

/** core 自己的排程 名稱已帶前綴 runCron 會合併進模組的排程清單 */
export const notificationsCron: Record<string, CronTask> = {
  "notifications:cleanup": expiringTask(cleanupNoticesAndAnnouncements, notificationsTag, announcementTags.announcements),
};
