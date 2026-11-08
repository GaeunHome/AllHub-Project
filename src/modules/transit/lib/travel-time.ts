import { asArray, asRecord, createMissing, numberOf, text } from "@/core/json";

// 欄位照 swagger 與公開的真實回應 還沒用這個專案的金鑰驗證
// 臺北捷運與環狀線只列單向的相鄰兩站 機場捷運是累計

/** 行駛秒數的 key 是起站>迄站 停站秒數的 key 是車站 */
export type TravelTimes = { runs: Record<string, number>; stops: Record<string, number> };

/** 走到另一條線與等車的時間 TDX 沒有這個資料 寫約幾分鐘所以用固定值 */
export const TRANSFER_MINUTES = 5;

const EXPRESS = 2;
const pair = (from: string, to: string) => `${from}>${to}`;

/** 行駛 0 秒是還沒補上的路段 停站取最短的 同一站在折返的路線會停很久 */
export function parseTravelTimes(json: unknown): { times: TravelTimes; missing: string[] } {
  const missing = createMissing();
  const times: TravelTimes = { runs: {}, stops: {} };
  for (const value of asArray(json)) {
    const row = asRecord(value);
    if (numberOf(row?.TrainType) === EXPRESS) continue;
    for (const item of missing.list(row, "TravelTimes", "TravelTimes")) {
      const entry = asRecord(item);
      const from = missing.need(text(entry?.FromStationID), "TravelTimes[].FromStationID");
      const to = missing.need(text(entry?.ToStationID), "TravelTimes[].ToStationID");
      const run = missing.need(numberOf(entry?.RunTime), "TravelTimes[].RunTime");
      if (from === null || to === null || run === null || run <= 0) continue;
      times.runs[pair(from, to)] ??= run;
      const stop = numberOf(entry?.StopTime) ?? 0;
      if (stop > 0) times.stops[from] = Math.min(times.stops[from] ?? stop, stop);
    }
  }
  return { times, missing: missing.sorted() };
}

const runBetween = ({ runs }: TravelTimes, from: string, to: string): number | null => runs[pair(from, to)] ?? runs[pair(to, from)] ?? null;

/** 起訖站有一列就是累計的時間 不然一站一站加 中間的站才算停靠 少一段就不算 */
export function legSeconds(stationIds: string[], times: TravelTimes): number | null {
  const first = stationIds[0];
  const last = stationIds.at(-1);
  if (stationIds.length < 2 || first === undefined || last === undefined) return null;
  const direct = runBetween(times, first, last);
  if (direct !== null) return direct;
  let total = 0;
  for (let index = 1; index < stationIds.length; index += 1) {
    const run = runBetween(times, stationIds[index - 1], stationIds[index]);
    if (run === null) return null;
    total += run + (index > 1 ? (times.stops[stationIds[index - 1]] ?? 0) : 0);
  }
  return total;
}

type TimedLeg = { system: string; stationIds: string[] };
type TimesBySystem = Record<string, TravelTimes | null | undefined>;

/** 一段要坐幾秒 那個系統的行車時間讀不到是 null */
export function legSecondsOf({ system, stationIds }: TimedLeg, timesBySystem: TimesBySystem): number | null {
  const times = timesBySystem[system];
  return times ? legSeconds(stationIds, times) : null;
}

/** 有一段讀不到就不寫 少算一段比不寫更糟 */
export function tripMinutes(legs: TimedLeg[], timesBySystem: TimesBySystem): number | null {
  if (legs.length === 0) return null;
  let seconds = 0;
  for (const leg of legs) {
    const ride = legSecondsOf(leg, timesBySystem);
    if (ride === null) return null;
    seconds += ride;
  }
  return Math.round(seconds / 60) + (legs.length - 1) * TRANSFER_MINUTES;
}

export type LegTimes = { departs: number | null; arrives: number | null };

/** 照第一段開車的時間推每一段大約幾點開 幾點到 有一段不知道要坐多久 之後都不寫 */
export function legSchedule(departAt: number, seconds: readonly (number | null)[]): LegTimes[] {
  let reached: number | null = departAt;
  return seconds.map((ride, index) => {
    const departs: number | null = index === 0 ? reached : reached === null ? null : reached + TRANSFER_MINUTES * 60_000;
    const arrives = departs === null || ride === null ? null : departs + ride * 1000;
    reached = arrives;
    return { departs, arrives };
  });
}
