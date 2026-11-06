import "server-only";
import { logError } from "@/core/errors";
import { HttpStatusError } from "@/core/external-url";
import { soonestEta, parseBusEta, parseBusRoute, parseBusSchedule, type BusDirection, type BusEta, type BusSchedule } from "../lib/bus";
import type { LiveReading } from "../lib/countdown";
import { parseMetroFare, parseThsrFares, parseTraFares, type CabinFare, type TraFare } from "../lib/fares";
import { parseMetroEstimate, parseTraDelays } from "../lib/live";
import { metroNetwork, type MetroNetwork } from "../lib/metro-route";
import { hasMetroLive, type MetroSystem, type Mode } from "../lib/modes";
import { busRequest, dailyTimetablePath, metroFareRequest, stationFilter, stationOfLinePath, stationsPath, tdxGet, tdxGetNow, tdxProblem, thsrFarePath, traFarePath, travelTimePath } from "../lib/tdx";
import { metroDirections, parseDailyTimetable, parseLineStations, parseMetroLines, parseMetroTimetable, parseStations, type Departure, type MetroLine, type Station } from "../lib/timetable";
import { parseTravelTimes, type TravelTimes } from "../lib/travel-time";

// 向 TDX 讀資料 讀不到回摘要 不丟錯 一條路線讀不到不影響其他路線

export type Read<T> = { ok: true; data: T } | { ok: false; problem: string };

async function read<T>(work: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    logError("transit", "讀不到 TDX", error);
    return { ok: false, problem: tdxProblem(error) };
  }
}

/** 好幾個讀取一起回報系統狀態 沒有讀的是 null */
export function problemOf(...reads: (Read<unknown> | null)[]): string | null {
  for (const result of reads) if (result && !result.ok) return result.problem;
  return null;
}

/** 票價與行車時間只是多看到一點 沒有資料回 null 不算 TDX 出問題 欄位不同時 log 只記欄位名稱 */
async function readExtra<T>(what: string, work: () => Promise<{ value: T | null; missing: string[] }>): Promise<Read<T | null>> {
  try {
    const { value, missing } = await work();
    if (missing.length > 0) console.warn(`[transit] ${what}少了欄位`, missing.join(", "));
    return { ok: true, data: value };
  } catch (error) {
    logError("transit", `讀不到${what}`, error);
    if (error instanceof SyntaxError || (error instanceof HttpStatusError && error.status === 404)) return { ok: true, data: null };
    return { ok: false, problem: tdxProblem(error) };
  }
}

export const readThsrFares = (originId: string, destinationId: string): Promise<Read<CabinFare[] | null>> =>
  readExtra("高鐵票價", async () => {
    const { fares, missing } = parseThsrFares(await tdxGetNow(thsrFarePath(originId, destinationId)), originId, destinationId);
    return { value: fares.length > 0 ? fares : null, missing };
  });

export const readTraFares = (originId: string, destinationId: string): Promise<Read<TraFare[] | null>> =>
  readExtra("台鐵票價", async () => {
    const { fares, missing } = parseTraFares(await tdxGetNow(traFarePath(originId, destinationId)), originId, destinationId);
    return { value: fares.length > 0 ? fares : null, missing };
  });

export const readMetroFare = (system: string, originId: string, destinationId: string): Promise<Read<number | null>> =>
  readExtra("捷運票價", async () => {
    const { fare, missing } = parseMetroFare(await tdxGetNow(...metroFareRequest(system, originId, destinationId)), originId, destinationId);
    return { value: fare, missing };
  });

export const readTravelTimes = (system: string): Promise<Read<TravelTimes | null>> =>
  readExtra("捷運行車時間", async () => {
    const { times, missing } = parseTravelTimes(await tdxGetNow(travelTimePath(system)));
    return { value: Object.keys(times.runs).length > 0 ? times : null, missing };
  });

/** 空的不能留在快取裡一天 算讀不到 幾分鐘後再試 */
export async function readStations(mode: Exclude<Mode, "bus">, system: string): Promise<Read<Station[]>> {
  const result = await read(async () => parseStations(await tdxGet(stationsPath(mode, system))));
  return result.ok && result.data.length === 0 ? { ok: false, problem: "TDX 的車站資料是空的或格式不同" } : result;
}

export type MetroSystemLines = { stations: Station[]; lines: MetroLine[] };

/** 車站與路線在同一個回應裡 省下一次 欄位不同時讀不出來 算讀不到 空的才不會在快取裡留一天 */
export async function readMetroSystem(system: string): Promise<Read<MetroSystemLines>> {
  const result = await read(async () => {
    const json = await tdxGet(stationOfLinePath(system));
    return { stations: parseLineStations(json), lines: parseMetroLines(json) };
  });
  return result.ok && (result.data.stations.length === 0 || result.data.lines.length === 0) ? { ok: false, problem: "TDX 的路線資料是空的或格式不同" } : result;
}

export type MetroSystemRead = { system: MetroSystem; read: Read<MetroSystemLines> };
/** missing 是資料不完整的系統 problem 給站長看 */
export type NetworkRead = { network: MetroNetwork; missing: MetroSystem[]; problem: string | null };

/** 一個系統讀不到時留其他的 不能讓人選不了站 全部都讀不到才算失敗 */
export function joinMetroSystems(reads: MetroSystemRead[]): Read<NetworkRead> {
  const failed = reads.flatMap(({ system, read }) => (read.ok ? [] : [{ system, problem: read.problem }]));
  const network = metroNetwork(reads.flatMap(({ system, read }) => (read.ok ? [{ system, ...read.data }] : [])));
  const problem = failed[0]?.problem ?? null;
  if (network.stations.length === 0) return { ok: false, problem: problem ?? "TDX 的路線資料是空的或格式不同" };
  return { ok: true, data: { network, missing: failed.map(({ system }) => system), problem } };
}

const metroTimetable = (system: string, stationId: string) => tdxGet(`/v2/Rail/Metro/StationTimeTable/${system}`, stationFilter(stationId));

export const readDirections = (system: string, stationId: string): Promise<Read<Station[]>> => read(async () => metroDirections(await metroTimetable(system, stationId)));

export function readDepartures(mode: Exclude<Mode, "bus">, system: string, originId: string, destinationId: string, date: string): Promise<Read<Departure[]>> {
  return read(async () => (mode === "metro" ? parseMetroTimetable(await metroTimetable(system, originId), date, destinationId) : parseDailyTimetable(await tdxGet(dailyTimetablePath(mode, originId, destinationId, date)), date)));
}

export const readBusRoute = (city: string, line: string): Promise<Read<BusDirection[]>> => read(async () => parseBusRoute(await tdxGet(...busRequest("StopOfRoute", city, line))));

export const readBusEta = (city: string, line: string, direction: number): Promise<Read<Record<string, BusEta>>> => read(async () => parseBusEta(await tdxGet(...busRequest("EstimatedTimeOfArrival", city, line)), direction));

export const readBusSchedule = (city: string, line: string, direction: number, date: string, minutes: number): Promise<Read<BusSchedule>> => read(async () => parseBusSchedule(await tdxGet(...busRequest("Schedule", city, line)), direction, date, minutes));

type LiveTarget = { mode: Mode; system: string; line: string; originId: string; destinationId: string };

async function liveReading({ mode, system, line, originId, destinationId }: LiveTarget, now: Date): Promise<LiveReading> {
  const readAt = now.getTime();
  if (mode === "tra") return { kind: "delays", delays: parseTraDelays(await tdxGetNow(`/v2/Rail/TRA/LiveBoard/Station/${originId}`)) };
  if (mode === "bus") return { kind: "estimate", ...soonestEta(await tdxGetNow(...busRequest("EstimatedTimeOfArrival", system, line)), originId, Number(destinationId)), readAt };
  if (mode === "metro" && hasMetroLive(system)) {
    const minutes = parseMetroEstimate(await tdxGetNow(`/v2/Rail/Metro/LiveBoard/${system}`, stationFilter(originId)), destinationId);
    return { kind: "estimate", seconds: minutes === null ? null : minutes * 60, readAt };
  }
  return { kind: "none" };
}

/** 高鐵沒有即時資料 捷運只有部分系統有 這幾種不用問 TDX */
export const readLive = (target: LiveTarget, now: Date): Promise<Read<LiveReading>> => read(() => liveReading(target, now));
