import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { remindersTags } from "./service/cache-tags";
import { sendDailyReminders } from "./service/daily";

export const remindersCron: Record<string, CronTask> = {
  // 過期的提醒會被刪掉 首頁卡片讀的是同一張表
  daily: expiringTask(() => sendDailyReminders(), remindersTags.items),
};
