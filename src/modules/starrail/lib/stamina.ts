import { formatTaipeiTime, staminaFullAt, type DailyNote } from "./responses";

const DEFAULT_ALERT_MARGIN = 20;
/** 每 6 分鐘回 1 點 兩次排程之間最長將近兩小時 這段時間回 20 點 */
const POINTS_BEFORE_NEXT_RUN = 20;

export function alertThreshold(note: DailyNote, custom: number | null): number | null {
  if (custom !== null) return custom;
  return note.maxStamina === null ? null : Math.max(0, note.maxStamina - DEFAULT_ALERT_MARGIN);
}

/**
 * 自然回復只到上限 門檻設得比上限高才等於關閉提醒
 * 用道具補到超過上限的不會再回
 */
function staminaByNextRun(stamina: number, max: number | null): number {
  return max === null ? stamina + POINTS_BEFORE_NEXT_RUN : Math.max(stamina, Math.min(max, stamina + POINTS_BEFORE_NEXT_RUN));
}

/**
 * Vercel 只保證排程在那個小時內跑 兩次之間最長將近兩小時 這段時間內會達到門檻就先通知
 * 同一輪只通知一次 降到兩小時內到不了門檻才重設 下次快到時再通知
 */
export function staminaAlertAction(
  note: DailyNote,
  custom: number | null,
  alreadyAlerted: boolean,
): "alert" | "reset" | "none" {
  const threshold = alertThreshold(note, custom);
  if (note.stamina === null || threshold === null) return "none";
  if (staminaByNextRun(note.stamina, note.maxStamina) >= threshold) return alreadyAlerted ? "none" : "alert";
  return alreadyAlerted ? "reset" : "none";
}

/** 便箋的進度條 超過上限也只畫滿 讀不到時是 0 */
export function percentOf(value: number | null, max: number | null): number {
  return value !== null && max ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

/**
 * 開拓力的進度條與回滿時間 便箋可能是幾分鐘前查的
 * 回滿時間從查詢當下起算 已經過了就當作回滿 回傳 null
 */
export function staminaGauge(note: DailyNote, fetchedAt: Date, now: Date): { percent: number; fullAt: Date | null } {
  const recoveredAt = staminaFullAt(note, fetchedAt);
  return { percent: percentOf(note.stamina, note.maxStamina), fullAt: recoveredAt && recoveredAt > now ? recoveredAt : null };
}

/** 星穹鐵道頁與首頁寫的回滿時間 fullAt 是 staminaGauge 算的 */
export function staminaFullText(note: DailyNote, fullAt: Date | null, now: Date): string {
  if (fullAt) return `${formatTaipeiTime(fullAt, now)} 回滿`;
  return note.stamina !== null ? "已回滿" : "回滿時間不明";
}
