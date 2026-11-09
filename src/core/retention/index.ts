import { DAY_MS } from "../time";

// 使用者要求通知類紀錄只留兩週 記帳等資料要永久保留 不能套用
export const RETENTION_DAYS = 14;

/** 操作紀錄有 IP 使用者要求只留一週 */
export const AUDIT_RETENTION_DAYS = 7;

export function retentionCutoff(now: Date, days = RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
