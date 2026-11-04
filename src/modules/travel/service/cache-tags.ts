import type { CacheTag } from "@/core/cache";

export const travelTags = {
  trips: "travel:trips",
  members: "travel:members",
  items: "travel:items",
  comments: "travel:comments",
  checks: "travel:checks",
} as const satisfies Record<string, CacheTag<"travel">>;
