import { DAY_MS } from "../time";

// 使用者要求通知類紀錄只留兩週 記帳等資料要永久保留 不能套用
export const RETENTION_DAYS = 14;

/** 操作紀錄有 IP 使用者要求只留一週 */
export const AUDIT_RETENTION_DAYS = 7;

/** 使用者要的 公告結束超過一個月就刪 用 30 天算 沒寫結束時間的留到站長刪 */
export const ANNOUNCEMENT_RETENTION_DAYS = 30;

/** 使用者要的 邀請到期或撤銷超過 30 天就刪 期限最長 30 天 所以建立後兩個月內一定清掉 */
export const INVITE_RETENTION_DAYS = 30;

export function retentionCutoff(now: Date, days = RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
