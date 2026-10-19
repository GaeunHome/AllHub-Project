import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { sendRainAlerts } from "./service/rain-alerts";

export const weatherCron: Record<string, CronTask> = {
  // 只寫通知與認領紀錄 notify 自己會讓通知的快取失效
  rain: expiringTask(sendRainAlerts),
};
