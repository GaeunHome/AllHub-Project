import { authTags } from "@/core/auth/cache-tags";
import type { CacheTag } from "@/core/cache";

export const travelTags = {
  trips: "travel:trips",
  members: "travel:members",
  items: "travel:items",
  comments: "travel:comments",
  checks: "travel:checks",
} as const satisfies Record<string, CacheTag<"travel">>;

/** 同行的人的名字與頭像讀自 core_users 由帳號那邊失效 */
export const usersTag = authTags.users;
