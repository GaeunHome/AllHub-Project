import { DAY_MS } from "./time";

// 使用者要求通知類紀錄只留兩週 記帳等資料要永久保留 不能套用
export const RETENTION_DAYS = 14;

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}
