import { staminaFullAt, type DailyNote } from "./responses";

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

/**
 * 開拓力的進度條與回滿時間 便箋可能是幾分鐘前查的
 * 回滿時間從查詢當下起算 已經過了就當作回滿 回傳 null
 */
export function staminaGauge(note: DailyNote, fetchedAt: Date, now: Date): { percent: number; fullAt: Date | null } {
  const percent = note.stamina !== null && note.maxStamina ? Math.min(100, Math.round((note.stamina / note.maxStamina) * 100)) : 0;
  const recoveredAt = staminaFullAt(note, fetchedAt);
  return { percent, fullAt: recoveredAt && recoveredAt > now ? recoveredAt : null };
}
