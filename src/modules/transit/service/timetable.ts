import "server-only";
import { logError } from "@/core/errors";
import { soonestEta, parseBusEta, parseBusRoute, parseBusSchedule, type BusDirection, type BusEta, type BusSchedule } from "../lib/bus";
import type { LiveReading } from "../lib/countdown";
import { parseMetroEstimate, parseTraDelays } from "../lib/live";
import { metroNetwork, type MetroNetwork } from "../lib/metro-route";
import { hasMetroLive, type MetroSystem, type Mode } from "../lib/modes";
import { busRequest, dailyTimetablePath, stationFilter, stationOfLinePath, stationsPath, tdxGet, tdxProblem } from "../lib/tdx";
import { metroDirections, parseDailyTimetable, parseMetroLines, parseMetroTimetable, parseStations, type Departure, type MetroLine, type Station } from "../lib/timetable";

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

/** 空的不能留在快取裡一天 算讀不到 幾分鐘後再試 */
export async function readStations(mode: Exclude<Mode, "bus">, system: string): Promise<Read<Station[]>> {
  const result = await read(async () => parseStations(await tdxGet(stationsPath(mode, system))));
  return result.ok && result.data.length === 0 ? { ok: false, problem: "TDX 的車站資料是空的或格式不同" } : result;
}

/** 欄位不同時讀不出路線 算讀不到 空的才不會在快取裡留一天 */
export async function readMetroLines(system: string): Promise<Read<MetroLine[]>> {
  const result = await read(async () => parseMetroLines(await tdxGet(stationOfLinePath(system))));
  return result.ok && result.data.length === 0 ? { ok: false, problem: "TDX 的路線資料是空的或格式不同" } : result;
}

export type MetroSystemRead = { system: MetroSystem; stations: Read<Station[]>; lines: Read<MetroLine[]> };
/** missing 是資料不完整的系統 problem 給站長看 */
export type NetworkRead = { network: MetroNetwork; missing: MetroSystem[]; problem: string | null };

const EMPTY_STATIONS = "TDX 的車站資料是空的或格式不同";

function systemProblem({ stations, lines }: MetroSystemRead): string | null {
  if (!stations.ok) return stations.problem;
  if (stations.data.length === 0) return EMPTY_STATIONS;
  return lines.ok ? null : lines.problem;
}

/** 一個系統讀不到時留其他的 只讀到車站也留著 不能讓人選不了站 全部都沒有車站才算失敗 */
export function joinMetroSystems(reads: MetroSystemRead[]): Read<NetworkRead> {
  const failed = reads.flatMap((read) => {
    const problem = systemProblem(read);
    return problem === null ? [] : [{ system: read.system, problem }];
  });
  const network = metroNetwork(reads.map(({ system, stations, lines }) => ({ system, stations: stations.ok ? stations.data : [], lines: lines.ok ? lines.data : [] })));
  const problem = failed[0]?.problem ?? null;
  if (network.stations.length === 0) return { ok: false, problem: problem ?? EMPTY_STATIONS };
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
  if (mode === "tra") return { kind: "delays", delays: parseTraDelays(await tdxGet(`/v2/Rail/TRA/LiveBoard/Station/${originId}`)) };
  if (mode === "bus") return { kind: "estimate", ...soonestEta(await tdxGet(...busRequest("EstimatedTimeOfArrival", system, line)), originId, Number(destinationId)), readAt };
  if (mode === "metro" && hasMetroLive(system)) {
    const minutes = parseMetroEstimate(await tdxGet(`/v2/Rail/Metro/LiveBoard/${system}`, stationFilter(originId)), destinationId);
    return { kind: "estimate", seconds: minutes === null ? null : minutes * 60, readAt };
  }
  return { kind: "none" };
}

/** 高鐵沒有即時資料 捷運只有部分系統有 這幾種不用問 TDX */
export const readLive = (target: LiveTarget, now: Date): Promise<Read<LiveReading>> => read(() => liveReading(target, now));
