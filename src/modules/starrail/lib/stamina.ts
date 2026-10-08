import type { DailyNote } from "./responses";

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
