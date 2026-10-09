import type { CacheTag } from "../cache";

/** 管理頁的使用者清單與邀請清單（core_users、core_invites）；登入檢查要讀最新資料，不快取也不用這些 tag */
export const authTags = {
  users: "core:users",
  invites: "core:invites",
} as const satisfies Record<string, CacheTag<"core">>;
