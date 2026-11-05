import { metroLine, metroLineName } from "./lines";
import type { MetroNetwork } from "./metro-route";
import { plainName } from "./station-search";
import type { Station } from "./timetable";

// 選車站的面板怎麼分組 沒有一站分得進去時回空的 面板改列完整清單

export type StationGroup = { id: string; name: string; color?: string; stations: Station[] };

const OTHERS = "其他";

/** 照台鐵官網的順序 新竹與嘉義的縣市併成一組 */
const TRA_REGIONS = ["基隆市", "新北市", "臺北市", "桃園市", "新竹", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義", "臺南市", "高雄市", "屏東縣", "臺東縣", "花蓮縣", "宜蘭縣"];

/** 分不進去的站排在最後 不能讓人選不了站 */
function withOthers(groups: StationGroup[], stations: Station[]): StationGroup[] {
  if (groups.length === 0) return [];
  const grouped = new Set(groups.flatMap((group) => group.stations.map((station) => station.id)));
  const others = stations.filter((station) => !grouped.has(station.id));
  return others.length > 0 ? [...groups, { id: OTHERS, name: OTHERS, stations: others }] : groups;
}

const regionOf = (city = "") => TRA_REGIONS.find((region) => plainName(city).startsWith(region));

export function cityGroups(stations: Station[]): StationGroup[] {
  const regions = stations.map((station) => regionOf(station.city));
  const groups = TRA_REGIONS.flatMap((region) => {
    const inRegion = stations.filter((_, index) => regions[index] === region);
    return inRegion.length > 0 ? [{ id: region, name: region, stations: inRegion }] : [];
  });
  return withOthers(groups, stations);
}

/** 支線併進主線那一組 名稱用車站清單的 清單沒有的站查不到時刻表 也存不成常用路線 */
export function lineGroups({ stations, lines }: MetroNetwork): StationGroup[] {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const merged = new Map<string, { system: string; stationIds: Set<string> }>();
  for (const { id, system, stationIds } of lines) {
    const line = merged.get(id) ?? { system, stationIds: new Set<string>() };
    for (const stationId of stationIds) line.stationIds.add(stationId);
    merged.set(id, line);
  }
  const groups = [...merged].flatMap(([id, { system, stationIds }]) => {
    const onLine = [...stationIds].flatMap((stationId) => byId.get(stationId) ?? []);
    return onLine.length > 0 ? [{ id, name: metroLineName(system, id), color: metroLine(system, id).color, stations: onLine }] : [];
  });
  return withOthers(groups, stations);
}
