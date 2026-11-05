import { metroLine } from "./lines";
import { plainName } from "./station-search";
import type { MetroLine, Station } from "./timetable";

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

/** 名稱用車站清單的 清單沒有的站查不到時刻表 也存不成常用路線 */
export function lineGroups(system: string, stations: Station[], lines: MetroLine[]): StationGroup[] {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const groups = lines.flatMap((line) => {
    const onLine = line.stationIds.flatMap((id) => byId.get(id) ?? []);
    const { name, color } = metroLine(system, line.id);
    return onLine.length > 0 ? [{ id: line.id, name: name ?? `${line.id} 線`, color, stations: onLine }] : [];
  });
  return withOthers(groups, stations);
}
