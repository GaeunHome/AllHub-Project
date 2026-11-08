import type { Mode } from "./modes";
import type { Departure } from "./timetable";

// 使用者要的 每 5 秒更新一次 跟捷運站一樣
// 秒數在瀏覽器算 真的每 5 秒問 TDX 額度撐不到 10 分鐘

export const TICK_MS = 5000;
/** 開車前多久才開始問即時資料 台鐵的看板也只有前後 30 分鐘 */
export const LIVE_WINDOW_MS = 30 * 60_000;
export const LIVE_INTERVAL_MS = 60_000;

/** estimate 是還有幾秒到 捷運只給到分鐘 公車有秒 status 是沒有車時的說明 */
export type LiveReading = { kind: "delays"; delays: Record<string, number> } | { kind: "estimate"; seconds: number | null; readAt: number; status?: string | null } | { kind: "none" };

/** 大字與小字分開排 空的代表車已經到了 */
export function countdownUnits(ms: number): { value: number; unit: string }[] {
  const seconds = Math.floor(ms / 1000);
  if (seconds <= 0) return [];
  if (seconds >= 3600) return [{ value: Math.floor(seconds / 3600), unit: "小時" }, { value: Math.floor((seconds % 3600) / 60), unit: "分" }];
  return seconds >= 60 ? [{ value: Math.floor(seconds / 60), unit: "分" }, { value: seconds % 60, unit: "秒" }] : [{ value: seconds, unit: "秒" }];
}

export function countdownText(ms: number): string {
  const units = countdownUnits(ms);
  return units.length > 0 ? units.map(({ value, unit }) => `${value} ${unit}`).join(" ") : "進站中";
}

export const upcoming = (departures: readonly Departure[], now: number) => departures.filter((departure) => departure.at > now).sort((a, b) => a.at - b.at);

const blank = (at: number): Departure => ({ at, arrivesAt: null, trainNo: null, kind: null, toward: null });

export function withLive(departures: readonly Departure[], live: LiveReading, now: number): Departure[] {
  if (live.kind === "delays") {
    const delayed = departures.map((departure) => ({ ...departure, at: departure.at + (departure.trainNo === null ? 0 : (live.delays[departure.trainNo] ?? 0)) * 60_000 }));
    return upcoming(delayed, now);
  }
  const scheduled = upcoming(departures, now);
  if (live.kind === "none" || live.seconds === null) return scheduled;
  const at = live.readAt + live.seconds * 1000;
  return [{ ...(scheduled[0] ?? blank(at)), at }, ...scheduled.slice(1).filter((departure) => departure.at > at)];
}

/** 存了車次的路線 今天與明天是同一個車次 要比對開車時間不晚於它的那一班 */
export function delayMinutes(next: Departure, departures: readonly Departure[]): number {
  const scheduled = departures.filter((departure) => departure.trainNo !== null && departure.trainNo === next.trainNo && departure.at <= next.at).at(-1);
  return scheduled ? Math.round((next.at - scheduled.at) / 60_000) : 0;
}

/** 存了車次的路線只有一班 誤點時過了開車時間還沒開走 要多問一段時間才知道 */
export function liveAnchor(departures: readonly Departure[], now: number, trainNo: string): number | null {
  return upcoming(departures, trainNo ? now - LIVE_WINDOW_MS : now)[0]?.at ?? null;
}

/** nextAt 是 null 代表時刻表上沒有下一班 捷運的文湖線本來就沒有時刻表 只能問看板 */
export function shouldReadLive(mode: Mode, nextAt: number | null, now: number): boolean {
  if (mode === "thsr") return false;
  // 公車沒有固定的時刻 只能一直看預估
  if (mode === "bus") return true;
  if (nextAt === null) return mode === "metro";
  return nextAt - now <= LIVE_WINDOW_MS;
}
