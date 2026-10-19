// 提醒都照伺服器當地的時間 每天 04:00 重置 週一 04:00 換週
// 同一期只提醒一次 由 service 記下 這裡只判斷該不該提醒

import { DAY_MS, HOUR_MS } from "@/core/time";
import { isOngoing, progressFull, type CalendarChallenge } from "./calendar";
import type { DailyNote } from "./responses";

/** 伺服器時區固定 沒有夏令時間 認不得的伺服器當成 UTC+8 */
const OFFSET_HOURS: Record<string, number> = { prod_official_usa: -5, prod_official_eur: 1, prod_official_asia: 8, prod_official_cht: 8 };
const RESET_HOUR = 4;

/** 每日實訓 晚上九點還沒做完才提醒 */
const DAILY_FROM_HOUR = 21;
/** 每週內容 週日傍晚六點起提醒 */
const WEEKLY_FROM_HOUR = 18;
/** 終局挑戰 傍晚六點後才查 不在半夜跳通知 */
const ENDGAME_FROM_HOUR = 18;

export function serverOffsetHours(region: string): number {
  return OFFSET_HOURS[region] ?? 8;
}

/** 伺服器當地的日期 星期與小時 */
function localClock(region: string, now: Date) {
  const local = new Date(now.getTime() + serverOffsetHours(region) * HOUR_MS);
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay(), hour: local.getUTCHours() };
}

/** 下一次 04:00 重置的時間點 */
export function nextReset(region: string, now: Date): Date {
  const offset = serverOffsetHours(region) * HOUR_MS;
  const local = new Date(now.getTime() + offset);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), RESET_HOUR);
  return new Date((today > local.getTime() ? today : today + DAY_MS) - offset);
}

/** period 是伺服器當地的日期 同一天只提醒一次 */
type DailyReminder = { period: string; score: number; max: number; resetAt: Date };

export function dailyTrainingReminder(note: DailyNote, region: string, now: Date): DailyReminder | null {
  const clock = localClock(region, now);
  if (clock.hour < DAILY_FROM_HOUR) return null;
  const { trainScore: score, maxTrainScore: max } = note;
  if (score === null || max === null || max <= 0 || score >= max) return null;
  return { period: clock.date, score, max, resetAt: nextReset(region, now) };
}

/** period 是那個週日的日期 沒做完的項目才有值 */
type WeeklyReminder = {
  period: string;
  rogue: { score: number; max: number } | null;
  cocoon: { remaining: number; limit: number | null } | null;
  resetAt: Date;
};

export function weeklyReminder(note: DailyNote, region: string, now: Date): WeeklyReminder | null {
  const clock = localClock(region, now);
  if (clock.weekday !== 0 || clock.hour < WEEKLY_FROM_HOUR) return null;
  const { rogueScore, maxRogueScore, cocoonRemaining, cocoonLimit } = note;
  const rogue = rogueScore !== null && maxRogueScore !== null && maxRogueScore > 0 && rogueScore < maxRogueScore ? { score: rogueScore, max: maxRogueScore } : null;
  const cocoon = cocoonRemaining !== null && cocoonRemaining > 0 ? { remaining: cocoonRemaining, limit: cocoonLimit } : null;
  if (!rogue && !cocoon) return null;
  return { period: clock.date, rogue, cocoon, resetAt: nextReset(region, now) };
}

/** 傍晚以後才查活動日曆 */
export function endgameCheckDue(region: string, now: Date): boolean {
  return localClock(region, now).hour >= ENDGAME_FROM_HOUR;
}

/**
 * 還剩一到兩天而且還沒拿滿的終局挑戰
 * 去重的紀錄只留一天 只在這一天的區間裡提醒 同一期才不會提醒兩次
 */
export function endgameReminders(challenges: CalendarChallenge[], now: Date): (CalendarChallenge & { endsAt: number })[] {
  return challenges.filter((challenge): challenge is CalendarChallenge & { endsAt: number } => {
    if (challenge.endsAt === null || !isOngoing(challenge, now)) return false;
    if (challenge.status === "unopened" || challenge.status === "finished" || progressFull(challenge) !== false) return false;
    const left = challenge.endsAt - now.getTime();
    return left > DAY_MS && left <= 2 * DAY_MS;
  });
}

/** 同一期的終局挑戰 用類型 編號與結束時間辨認 */
export function endgamePeriod(challenge: CalendarChallenge): string {
  return `${challenge.kind ?? "other"}:${challenge.id ?? ""}:${challenge.endsAt ?? ""}`;
}
