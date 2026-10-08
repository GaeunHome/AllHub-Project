// 使用者要求通知相關紀錄只留兩週；記帳等使用者資料要永久保留，不能套用
export const RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}
