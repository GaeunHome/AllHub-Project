import { metroLine, metroLineName } from "./lines";
import { plainName } from "./station-search";
import type { MetroLine, Station } from "./timetable";

// 捷運任兩站怎麼搭 轉乘最少 一樣多時站數最少 同名的站就是同一站 跨系統也一樣
// 只看到每條線的終點 開到半路就折返的班次不算

export type MetroSystemData = { system: string; stations: Station[]; lines: MetroLine[] };
export type NetworkLine = MetroLine & { system: string };
export type MetroNetwork = { stations: Station[]; lines: NetworkLine[] };
export type MetroLeg = { line: string; color: string; system: string; from: Station; to: Station; towardId: string; towardName: string; stops: number; stationIds: string[] };

/** 環狀線可能兩個系統都列 同一條線留後面的系統 TDX 的環狀線是新北捷運 */
export function metroNetwork(systems: MetroSystemData[]): MetroNetwork {
  const owners = new Map(systems.flatMap(({ system, lines }) => lines.map((line) => [line.id, system] as const)));
  const stations = new Map(systems.flatMap((data) => data.stations).map((station) => [station.id, station]));
  return {
    stations: [...stations.values()],
    lines: systems.flatMap(({ system, lines }) => lines.filter((line) => owners.get(line.id) === system).map((line) => ({ ...line, system }))),
  };
}

/** 蘆洲支線的車過了大橋頭直通南勢角 不用轉乘 小碧潭與新北投是接駁車 要轉 */
const THROUGH_BRANCHES: Record<string, string> = { O: "O12" };

/** TDX 的主線與支線是同一個 LineNo 短的是支線 只有算路線用 選站面板還是照 TDX 分組 */
function withThroughRuns(lines: NetworkLine[]): NetworkLine[] {
  return lines.map((line) => {
    const junction = THROUGH_BRANCHES[line.id];
    const trunk = lines.find((other) => other.id === line.id && other.stationIds.length > line.stationIds.length);
    const at = trunk?.stationIds.indexOf(junction) ?? -1;
    if (!trunk || at === -1) return line;
    return { ...line, stationIds: [...trunk.stationIds.slice(0, at + 1), ...line.stationIds.filter((id) => id !== junction)] };
  });
}

type Place = { line: number; at: number };
type Step = Place & { transfers: number; stops: number; previous: Step | null };

const byCost = (a: Step, b: Step) => a.transfers - b.transfers || a.stops - b.stops;

function placesByName(lines: NetworkLine[], names: Map<string, string>): Map<string, Place[]> {
  const places = new Map<string, Place[]>();
  lines.forEach(({ stationIds }, line) =>
    stationIds.forEach((id, at) => {
      const name = names.get(id);
      if (name !== undefined) places.set(name, [...(places.get(name) ?? []), { line, at }]);
    }),
  );
  return places;
}

/** 坐一站加一站 換線加一次轉乘 同名的站都能直接換 第一個走到迄站的就是最好的 */
function arrivalAt(lines: NetworkLine[], names: Map<string, string>, origin: string, target: string): Step | null {
  const places = placesByName(lines, names);
  const open: Step[] = (places.get(origin) ?? []).map((place) => ({ ...place, transfers: 0, stops: 0, previous: null }));
  const visited = new Set<string>();
  while (open.length > 0) {
    const step = open.sort(byCost).shift()!;
    const key = `${step.line}:${step.at}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const { stationIds } = lines[step.line];
    const name = names.get(stationIds[step.at]);
    if (name === target) return step;
    for (const at of [step.at - 1, step.at + 1]) {
      if (at >= 0 && at < stationIds.length) open.push({ line: step.line, at, transfers: step.transfers, stops: step.stops + 1, previous: step });
    }
    for (const place of places.get(name ?? "") ?? []) {
      if (place.line !== step.line) open.push({ ...place, transfers: step.transfers + 1, stops: step.stops, previous: step });
    }
  }
  return null;
}

/** 每換一條線切成一段 */
function ridesOf(arrival: Step): Step[][] {
  const rides: Step[][] = [];
  for (let step: Step | null = arrival; step; step = step.previous) {
    if (rides[0]?.[0].line === step.line) rides[0].unshift(step);
    else rides.unshift([step]);
  }
  return rides;
}

/** 同名的站不用搭車 回空陣列 走不到或車站不在路網裡回 null */
export function planRoute({ stations, lines: listed }: MetroNetwork, fromId: string, toId: string): MetroLeg[] | null {
  const lines = withThroughRuns(listed);
  const byId = new Map(stations.map((station) => [station.id, station]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) return null;
  if (plainName(from.name) === plainName(to.name)) return [];
  const names = new Map(stations.map(({ id, name }) => [id, plainName(name)]));
  const arrival = arrivalAt(lines, names, plainName(from.name), plainName(to.name));
  if (!arrival) return null;
  const station = (id: string) => byId.get(id) ?? { id, name: id };
  return ridesOf(arrival).map((ride) => {
    const line = lines[ride[0].line];
    const start = ride[0].at;
    const end = ride.at(-1)!.at;
    const toward = station(line.stationIds[end > start ? line.stationIds.length - 1 : 0]);
    const passed = line.stationIds.slice(Math.min(start, end), Math.max(start, end) + 1);
    return { line: metroLineName(line.system, line.id), color: metroLine(line.system, line.id).color, system: line.system, from: station(line.stationIds[start]), to: station(line.stationIds[end]), towardId: toward.id, towardName: toward.name, stops: ride.length - 1, stationIds: end > start ? passed : passed.reverse() };
  });
}

/** 票價表只有同一個系統裡的站 跨系統時不問 TDX 問了也是空的 */
export function fareSystemOf(legs: { system: string }[]): string | null {
  const [first, ...others] = legs;
  return first && others.every(({ system }) => system === first.system) ? first.system : null;
}
