import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { reencryptApiKeys } from "./service/ai-settings";
import { youtubeTags } from "./service/cache-tags";
import { renewSubscriptions } from "./service/channels";
import { cleanupVideos } from "./service/cleanup";

export const youtubeCron: Record<string, CronTask> = {
  renew: expiringTask(renewSubscriptions, youtubeTags.channels),
  cleanup: expiringTask(() => cleanupVideos(), youtubeTags.videos),
  reencrypt: expiringTask(reencryptApiKeys, youtubeTags.settings),
};
