import type { CacheTag } from "../cache";

/** 通知只有 core_notifications 一張表 讀寫都用這個 tag */
export const notificationsTag: CacheTag<"core"> = "core:notifications";
