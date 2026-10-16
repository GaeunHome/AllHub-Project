import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { checkStaminaAll, checkinAll, cleanupCheckinLogs, reencryptCookies } from "./service/accounts";
import { autoRedeemAll } from "./service/auto-redeem";
import { starrailTags } from "./service/cache-tags";

// 帳號的 tag 標著所有 HoYoLAB 的快取 只在帳號那一列真的改了時由 service 讓它失效
export const starrailCron: Record<string, CronTask> = {
  checkin: expiringTask(checkinAll, starrailTags.checkins),
  stamina: expiringTask(checkStaminaAll),
  cleanup: expiringTask(() => cleanupCheckinLogs(), starrailTags.checkins),
  reencrypt: expiringTask(reencryptCookies),
  // 試過的兌換碼只有排程自己讀 不用讓快取失效
  redeem: expiringTask(autoRedeemAll),
};
