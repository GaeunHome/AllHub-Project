import type { CacheTag } from "../cache";

export const announcementTags = {
  announcements: "core:announcements",
} as const satisfies Record<string, CacheTag<"core">>;
