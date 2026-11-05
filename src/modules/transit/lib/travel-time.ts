import { asArray, asRecord, createMissing, numberOf, text } from "@/core/json";

// 欄位對過 TDX 的 swagger 與公開的真實回應 還沒用這個專案的金鑰驗證
// 臺北捷運與環狀線只列一個方向的相鄰兩站 機場捷運是任兩站的累計時間

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

/** 有一段讀不到就不寫 少算一段比不寫更糟 */
export function tripMinutes(legs: { system: string; stationIds: string[] }[], timesBySystem: Record<string, TravelTimes | null | undefined>): number | null {
  if (legs.length === 0) return null;
  let seconds = 0;
  for (const { system, stationIds } of legs) {
    const times = timesBySystem[system];
    const leg = times ? legSeconds(stationIds, times) : null;
    if (leg === null) return null;
    seconds += leg;
  }
  return Math.round(seconds / 60) + (legs.length - 1) * TRANSFER_MINUTES;
}
