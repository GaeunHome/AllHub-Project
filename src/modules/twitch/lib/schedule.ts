import { asRecord, createMissing, text } from "@/core/json";
import { formatTaipeiHourMinute, formatTaipeiMonthDay, formatTaipeiShortDate, formatTaipeiWeekday, taipeiDayOffset } from "@/core/time";

// 主播的開台時間表 照 Twitch 的 Scheduling Broadcasts 指南 尚未用真實的主播驗證
// 時間存 UTC 的 ISO 字串 畫面一律換成台北時間

/** 詳情最多列幾次 */
export const SEGMENTS_SHOWN = 5;

export type ScheduleSegment = { start: string; end: string | null; title: string | null; category: string | null };
export type StreamSchedule = { segments: ScheduleSegment[]; vacation: { start: string; end: string } | null };

function isoOf(value: unknown): string | null {
  const raw = text(value);
  const time = raw === null ? Number.NaN : Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** 取消的與休假期間的不算 沒有 data 是格式不同回 null missing 是讀不到的欄位路徑 */
export function parseSchedule(json: unknown): { schedule: StreamSchedule; missing: string[] } | null {
  const data = asRecord(asRecord(json)?.data);
  if (!data) return null;
  const missing = createMissing();

  const rawVacation = asRecord(data.vacation);
  const vacationStart = rawVacation && missing.need(isoOf(rawVacation.start_time), "data.vacation.start_time");
  const vacationEnd = rawVacation && missing.need(isoOf(rawVacation.end_time), "data.vacation.end_time");
  const vacation = vacationStart && vacationEnd ? { start: vacationStart, end: vacationEnd } : null;
  const onVacation = (start: string) => vacation !== null && start >= vacation.start && start < vacation.end;

  // 有時間表但都沒排時 segments 是 null
  const rawSegments = data.segments === null ? [] : missing.list(data, "segments", "data.segments");
  const segments = rawSegments.flatMap((value): ScheduleSegment[] => {
    const segment = asRecord(value);
    const start = missing.need(isoOf(segment?.start_time), "data.segments[].start_time");
    if (!segment || start === null || segment.canceled_until != null || onVacation(start)) return [];
    return [{ start, end: isoOf(segment.end_time), title: text(segment.title), category: text(asRecord(segment.category)?.name) }];
  });
  return { schedule: { segments: segments.toSorted((a, b) => a.start.localeCompare(b.start)), vacation }, missing: missing.sorted() };
}

/** 還沒結束的 時間到了但還沒開台的也算 */
export function upcomingSegments({ segments }: StreamSchedule, now: Date, limit = SEGMENTS_SHOWN): ScheduleSegment[] {
  return segments.filter(({ start, end }) => Date.parse(end ?? start) > now.getTime()).slice(0, limit);
}

/** 清單上的下次開台 今天 明天 一週內寫星期 再遠寫日期 */
export function nextStartText(start: string, now: Date): string {
  const date = new Date(start);
  const offset = taipeiDayOffset(date, now);
  const day = offset === 0 ? "今天" : offset === 1 ? "明天" : offset > 1 && offset < 7 ? `週${formatTaipeiWeekday(date)}` : formatTaipeiMonthDay(date);
  return `${day} ${formatTaipeiHourMinute(date)}`;
}

/** 詳情的一次 例如 11/13 星期五 20:00 到 23:00 */
export function segmentTime({ start, end }: ScheduleSegment): string {
  const from = new Date(start);
  const head = `${formatTaipeiShortDate(from)}${formatTaipeiHourMinute(from)}`;
  return end === null ? `${head} 開始` : `${head}–${formatTaipeiHourMinute(new Date(end))}`;
}

export const vacationText = ({ start, end }: { start: string; end: string }) => `休假：${formatTaipeiMonthDay(new Date(start))} 到 ${formatTaipeiMonthDay(new Date(end))}`;
