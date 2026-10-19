// 使用者 id 與模組 id 的格式 proxy 用的 auth/session.ts 也會用 所以不 import 任何東西

/** core_users.id 小寫的 UUID */
export const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 模組 id 小寫英文開頭 只有小寫英數與連字號 最多 32 字 */
export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
