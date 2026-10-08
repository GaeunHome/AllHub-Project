import "server-only";
import { expiringTask } from "../cache";
import type { CronTask } from "../module";
import { notificationsTag } from "./cache-tags";
import { cleanupNotifications } from "./service";

/** core 自己的排程；名稱已帶前綴，runCron 會合併進模組的排程清單 */
export const notificationsCron: Record<string, CronTask> = {
  "notifications:cleanup": expiringTask(() => cleanupNotifications(), notificationsTag),
};
