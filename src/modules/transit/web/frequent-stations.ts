import type { Mode } from "../lib/modes";
import type { Station } from "../lib/timetable";
import type { TransitRoute } from "../data/schema";

type SavedRoute = Pick<TransitRoute, "mode" | "originId" | "originName" | "destinationId" | "destinationName">;

/** 常用路線用過的車站 資料都在自己的路線裡 不用問 TDX 用得多的排前面 */
export function frequentStations(routes: SavedRoute[], mode: Mode): Station[] {
  const metro = mode === "metro";
  const uses = new Map<string, { station: Station; count: number }>();
  const add = (id: string, name: string) => {
    const seen = uses.get(id);
    if (seen) seen.count += 1;
    else uses.set(id, { station: { id, name }, count: 1 });
  };
  for (const route of routes) {
    if (route.mode !== mode) continue;
    add(route.originId, route.originName);
    // 捷運的迄站是開往的終點站 不是用過的車站
    if (!metro) add(route.destinationId, route.destinationName);
  }
  return [...uses.values()].sort((a, b) => b.count - a.count).map((use) => use.station);
}
