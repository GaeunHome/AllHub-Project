import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { BusDirection, BusEta, BusSchedule } from "../lib/bus";
import type { LiveReading } from "../lib/countdown";
import type { CabinFare, TraFare } from "../lib/fares";
import { METRO_SYSTEMS, type MetroSystem, type Mode } from "../lib/modes";
import type { Departure, MetroLine, Station } from "../lib/timetable";
import type { TravelTimes } from "../lib/travel-time";
import type { TransitRoute } from "../data/schema";
import { transitTags } from "./cache-tags";
import { listRoutes } from "./routes";
import { joinMetroSystems, readBusEta, readBusRoute, readBusSchedule, readDepartures, readLive, readMetroFare, readMetroLines, readStations, readThsrFares, readTraFares, readTravelTimes, type NetworkRead, type Read } from "./timetable";

// 只給頁面與輪詢 API 用 外部資料不存資料庫 不分使用者 同一條路線大家共用同一份 才省額度

export async function cachedRoutes(userId: string): Promise<TransitRoute[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(transitTags.routes);
  return listRoutes(userId);
}

export async function cachedStations(mode: Exclude<Mode, "bus">, system: string): Promise<Read<Station[]>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readStations(mode, system);
  if (result.ok) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

export async function cachedMetroLines(system: string): Promise<Read<MetroLine[]>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readMetroLines(system);
  if (result.ok) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

/** 每個系統各自快取 一個系統讀不到時幾分鐘後只重讀它 其他的留一天才省額度 */
export async function cachedMetroNetwork(): Promise<Read<NetworkRead>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const systems = Object.keys(METRO_SYSTEMS) as MetroSystem[];
  const result = joinMetroSystems(await Promise.all(systems.map(async (system) => ({ system, stations: await cachedStations("metro", system), lines: await cachedMetroLines(system) }))));
  if (result.ok && result.data.problem === null) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

export async function cachedDepartures(mode: Exclude<Mode, "bus">, system: string, originId: string, destinationId: string, date: string): Promise<Read<Departure[]>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readDepartures(mode, system, originId, destinationId, date);
  if (result.ok) cacheLife("timetable");
  else cacheLife("external");
  return result;
}

// 票價與行車時間幾乎不會變 空的不能留一天 幾分鐘後再試

export async function cachedThsrFares(originId: string, destinationId: string): Promise<Read<CabinFare[] | null>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readThsrFares(originId, destinationId);
  if (result.ok && result.data !== null) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

export async function cachedTraFares(originId: string, destinationId: string): Promise<Read<TraFare[] | null>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readTraFares(originId, destinationId);
  if (result.ok && result.data !== null) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

export async function cachedMetroFare(system: string, originId: string, destinationId: string): Promise<Read<number | null>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readMetroFare(system, originId, destinationId);
  if (result.ok && result.data !== null) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

/** 一個系統一天讀一次 路線怎麼換都用同一份 */
export async function cachedMetroTravelTimes(system: string): Promise<Read<TravelTimes | null>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readTravelTimes(system);
  if (result.ok && result.data !== null) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

/** 同一站同一分鐘只問 TDX 一次 秒數由瀏覽器自己算 */
export async function cachedLive(mode: Mode, system: string, line: string, originId: string, destinationId: string): Promise<Read<LiveReading>> {
  "use cache: remote";
  cacheLife("board");
  cacheTag(transitTags.external);
  return readLive({ mode, system, line, originId, destinationId }, new Date());
}

export async function cachedBusRoute(city: string, line: string): Promise<Read<BusDirection[]>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readBusRoute(city, line);
  if (result.ok) cacheLife("avatar");
  else cacheLife("external");
  return result;
}

export async function cachedBusEta(city: string, line: string, direction: number): Promise<Read<Record<string, BusEta>>> {
  "use cache: remote";
  cacheLife("board");
  cacheTag(transitTags.external);
  return readBusEta(city, line, direction);
}

export async function cachedBusSchedule(city: string, line: string, direction: number, date: string, minutes: number): Promise<Read<BusSchedule>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readBusSchedule(city, line, direction, date, minutes);
  if (result.ok) cacheLife("records");
  else cacheLife("external");
  return result;
}
