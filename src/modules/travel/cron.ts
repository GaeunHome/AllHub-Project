import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { travelTags } from "./service/cache-tags";
import { cleanupTrips } from "./service/trips";

export const travelCron: Record<string, CronTask> = {
  cleanup: expiringTask(() => cleanupTrips(), ...Object.values(travelTags)),
};
