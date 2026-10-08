import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { youtubeTags } from "./service/cache-tags";
import { cleanupVideos, renewSubscriptions } from "./service/channels";
import { reencryptApiKeys } from "./service/translation";

export const youtubeCron: Record<string, CronTask> = {
  renew: expiringTask(renewSubscriptions, youtubeTags.channels),
  cleanup: expiringTask(() => cleanupVideos(), youtubeTags.videos),
  reencrypt: expiringTask(reencryptApiKeys, youtubeTags.settings),
};
