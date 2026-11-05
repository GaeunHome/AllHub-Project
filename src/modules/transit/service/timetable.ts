import "server-only";
import { logError } from "@/core/errors";
import { soonestEta, parseBusEta, parseBusRoute, parseBusSchedule, type BusDirection, type BusEta, type BusSchedule } from "../lib/bus";
import type { LiveReading } from "../lib/countdown";
import { parseMetroEstimate, parseTraDelays } from "../lib/live";
import { hasMetroLive, type Mode } from "../lib/modes";
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

export const readStations = (mode: Exclude<Mode, "bus">, system: string): Promise<Read<Station[]>> => read(async () => parseStations(await tdxGet(stationsPath(mode, system))));

/** 欄位不同時讀不出路線 算讀不到 空的才不會在快取裡留一天 */
export async function readMetroLines(system: string): Promise<Read<MetroLine[]>> {
  const result = await read(async () => parseMetroLines(await tdxGet(stationOfLinePath(system))));
  return result.ok && result.data.length === 0 ? { ok: false, problem: "TDX 的路線資料是空的或格式不同" } : result;
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
