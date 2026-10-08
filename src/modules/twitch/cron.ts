import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { twitchTags } from "./service/cache-tags";
import { cleanupStreamEvents, syncSubscriptions } from "./service/streamers";

export const twitchCron: Record<string, CronTask> = {
  sync: expiringTask(syncSubscriptions, twitchTags.streamers),
  cleanup: expiringTask(() => cleanupStreamEvents(), twitchTags.events),
};
