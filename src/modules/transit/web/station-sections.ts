import type { StationGroup } from "../lib/station-groups";
import { isSameStation, matchesStation, plainName } from "../lib/station-search";
import type { Station } from "../lib/timetable";

/** 平常先列常用再列分組 讀不到分組時列完整清單 沒有站的區塊不留 */
function allSections(stations: Station[], groups: StationGroup[], frequent: Station[]): StationGroup[] {
  const listed = groups.length > 0 ? groups : [{ id: "all", name: "全部車站", stations }];
  return [{ id: "frequent", name: "常用", stations: frequent }, ...listed].filter((section) => section.stations.length > 0);
}

const withoutStation = (sections: StationGroup[], except: Station) => sections.map((section) => ({ ...section, stations: section.stations.filter((station) => !isSameStation(station, except)) })).filter((section) => section.stations.length > 0);

/** except 是另一端選好的站 使用者要的 起站選了台北 迄站就不列台北 打字時只留對得上的站 同一站只列一次 常用排前面 */
export function pickerSections(stations: Station[], groups: StationGroup[], frequent: Station[], query: string, except: Station | null = null): StationGroup[] {
  const all = allSections(stations, groups, frequent);
  const sections = except ? withoutStation(all, except) : all;
  if (plainName(query) === "") return sections;
  const seen = new Set<string>();
  const firstMatches = (station: Station) => {
    if (seen.has(station.id) || !matchesStation(station.name, query)) return false;
    seen.add(station.id);
    return true;
  };
  return sections.map((section) => ({ ...section, stations: section.stations.filter(firstMatches) })).filter((section) => section.stations.length > 0);
}

/** 只剩一站時 Enter 直接選它 還有好幾站時不替使用者挑 */
export function soleStation(sections: StationGroup[]): Station | null {
  const stations = sections.flatMap((section) => section.stations);
  return stations.length === 1 ? stations[0] : null;
}
