import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { savingsTags } from "./service/cache-tags";
import { postDueRecurring } from "./service/recurring";

export const savingsCron: Record<string, CronTask> = {
  recurring: expiringTask(() => postDueRecurring(), savingsTags.transactions, savingsTags.recurring),
};
