import type { CacheTag } from "@/core/cache";

export const transitTags = {
  routes: "transit:routes",
  external: "transit:external",
} as const satisfies Record<string, CacheTag<"transit">>;
