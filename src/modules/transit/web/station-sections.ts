import type { StationGroup } from "../lib/station-groups";
import { isSameStation, matchesStation, plainName } from "../lib/station-search";
import type { Station } from "../lib/timetable";

const frequentSection = (frequent: Station[]): StationGroup => ({ id: "frequent", name: "常用", stations: frequent });

const nonEmpty = (sections: StationGroup[]) => sections.filter((section) => section.stations.length > 0);

/** except 是另一端選好的站 使用者要的 起站選了台北 迄站就不列台北 沒有站的區塊不留 */
function withoutStation(sections: StationGroup[], except: Station | null): StationGroup[] {
  if (!except) return nonEmpty(sections);
  return nonEmpty(sections.map((section) => ({ ...section, stations: section.stations.filter((station) => !isSameStation(station, except)) })));
}

/** 平常先列常用再列分組 讀不到分組時列完整清單 打字時只留對得上的站 同一站只列一次 常用排前面 */
export function pickerSections(stations: Station[], groups: StationGroup[], frequent: Station[], query: string, except: Station | null = null): StationGroup[] {
  const listed = groups.length > 0 ? groups : [{ id: "all", name: "全部車站", stations }];
  const sections = withoutStation([frequentSection(frequent), ...listed], except);
  if (plainName(query) === "") return sections;
  const seen = new Set<string>();
  const firstMatches = (station: Station) => {
    if (seen.has(station.id) || !matchesStation(station.name, query)) return false;
    seen.add(station.id);
    return true;
  };
  return nonEmpty(sections.map((section) => ({ ...section, stations: section.stations.filter(firstMatches) })));
}

/** 路線圖上方只留常用 圖上畫不到的站照分組列在圖的下面 不能讓人選不了站 */
export function mapSections(groups: StationGroup[], frequent: Station[], missing: Station[], except: Station | null): { frequent: StationGroup[]; others: StationGroup[] } {
  const ids = new Set(missing.map((station) => station.id));
  const grouped = groups.map((group) => ({ ...group, stations: group.stations.filter((station) => ids.has(station.id)) }));
  const listed = new Set(grouped.flatMap((group) => group.stations.map((station) => station.id)));
  const rest = missing.filter((station) => !listed.has(station.id));
  return { frequent: withoutStation([frequentSection(frequent)], except), others: withoutStation([...grouped, { id: "others", name: "其他車站", stations: rest }], except) };
}

/** 只剩一站時 Enter 直接選它 還有好幾站時不替使用者挑 */
export function soleStation(sections: StationGroup[]): Station | null {
  const stations = sections.flatMap((section) => section.stations);
  return stations.length === 1 ? stations[0] : null;
}
