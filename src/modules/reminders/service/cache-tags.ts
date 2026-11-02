import type { CacheTag } from "@/core/cache";

export const remindersTags = {
  items: "reminders:items",
} as const satisfies Record<string, CacheTag<"reminders">>;
