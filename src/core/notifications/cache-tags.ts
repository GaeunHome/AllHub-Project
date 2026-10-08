import type { CacheTag } from "../cache";

/** 網站通知只有 core_notifications 一張表，所有讀取與寫入都用這個 tag */
export const notificationsTag: CacheTag<"core"> = "core:notifications";
