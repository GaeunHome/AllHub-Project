import "server-only";
import { announcementTags } from "../announcements/cache-tags";
import { cleanupAnnouncements } from "../announcements/service";
import { authTags } from "../auth/cache-tags";
import { cleanupInvites } from "../auth/invites";
import { expiringTask } from "../cache";
import type { CronTask } from "../module";
import { notificationsTag } from "./cache-tags";
import { cleanupNotifications } from "./service";

/** 結束很久的公告與失效很久的邀請也在這裡清 Hobby 的排程有條數上限 不另外佔一條 */
async function cleanupOldRecords(): Promise<string> {
  return `${await cleanupNotifications()}，${await cleanupAnnouncements()}，${await cleanupInvites()}`;
}

/** core 自己的排程 名稱已帶前綴 runCron 會合併進模組的排程清單 */
export const notificationsCron: Record<string, CronTask> = {
  "notifications:cleanup": expiringTask(cleanupOldRecords, notificationsTag, announcementTags.announcements, authTags.invites),
};
