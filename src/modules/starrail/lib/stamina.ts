import { staminaFullAt, type DailyNote } from "./responses";

const DEFAULT_ALERT_MARGIN = 20;

export function alertThreshold(note: DailyNote, custom: number | null): number | null {
  if (custom !== null) return custom;
  return note.maxStamina === null ? null : Math.max(0, note.maxStamina - DEFAULT_ALERT_MARGIN);
}

/** 同一輪「快滿」只通知一次：降回門檻以下才 reset，下次達到門檻再通知 */
export function staminaAlertAction(
  note: DailyNote,
  custom: number | null,
  alreadyAlerted: boolean,
): "alert" | "reset" | "none" {
  const threshold = alertThreshold(note, custom);
  if (note.stamina === null || threshold === null) return "none";
  if (note.stamina >= threshold) return alreadyAlerted ? "none" : "alert";
  return alreadyAlerted ? "reset" : "none";
}

/** 開拓力的進度條與回滿時間：便箋可能是幾分鐘前查的，回滿時間從查詢當下起算，已經過了就當作回滿（null） */
export function staminaGauge(note: DailyNote, fetchedAt: Date, now: Date): { percent: number; fullAt: Date | null } {
  const percent = note.stamina !== null && note.maxStamina ? Math.min(100, Math.round((note.stamina / note.maxStamina) * 100)) : 0;
  const recoveredAt = staminaFullAt(note, fetchedAt);
  return { percent, fullAt: recoveredAt && recoveredAt > now ? recoveredAt : null };
}
