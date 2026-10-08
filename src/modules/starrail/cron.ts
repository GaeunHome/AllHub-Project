import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { checkStaminaAll, checkinAll, cleanupCheckinLogs, reencryptCookies } from "./service/accounts";
import { starrailTags } from "./service/cache-tags";

export const starrailCron: Record<string, CronTask> = {
  checkin: expiringTask(checkinAll, starrailTags.checkins, starrailTags.accounts),
  stamina: expiringTask(checkStaminaAll, starrailTags.accounts),
  cleanup: expiringTask(() => cleanupCheckinLogs(), starrailTags.checkins),
  reencrypt: expiringTask(reencryptCookies, starrailTags.accounts),
};
