import "server-only";
import type { CronTask } from "@/core/module";
import { twitchCron } from "./twitch/cron";
import { starrailCron } from "./starrail/cron";
import { youtubeCron } from "./youtube/cron";

/** 各模組的排程，key 會加上模組 id 前綴，例如 starrail:checkin */
const registry: Record<string, Record<string, CronTask>> = {
  twitch: twitchCron,
  starrail: starrailCron,
  youtube: youtubeCron,
};

export const cronTasks: Record<string, CronTask> = Object.fromEntries(
  Object.entries(registry).flatMap(([moduleId, tasks]) =>
    Object.entries(tasks).map(([name, task]) => [`${moduleId}:${name}`, task]),
  ),
);
