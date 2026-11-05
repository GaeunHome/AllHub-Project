import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { BusDirection, BusEta, BusSchedule } from "../lib/bus";
import type { LiveReading } from "../lib/countdown";
import type { Mode } from "../lib/modes";
import type { Departure, Station } from "../lib/timetable";
import type { TransitRoute } from "../data/schema";
import { transitTags } from "./cache-tags";
import { listRoutes } from "./routes";
import { readBusEta, readBusRoute, readBusSchedule, readDepartures, readDirections, readLive, readStations, type Read } from "./timetable";

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

export async function cachedDirections(system: string, stationId: string): Promise<Read<Station[]>> {
  "use cache: remote";
  cacheTag(transitTags.external);
  const result = await readDirections(system, stationId);
  if (result.ok) cacheLife("timetable");
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
