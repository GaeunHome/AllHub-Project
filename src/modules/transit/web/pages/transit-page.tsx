import { after } from "next/server";
import { Suspense, type ReactNode } from "react";
import { requireModule } from "@/core/auth";
import { hasTransitEnv } from "@/core/env";
import type { SearchParams } from "@/core/module";
import { addDaysToKey, formatTaipeiHourMinute, taipeiDateKey } from "@/core/time";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { fareSystemOf, planRoute, type MetroLeg } from "../../lib/metro-route";
import { METRO_SYSTEMS } from "../../lib/modes";
import { ROUTE_LIMIT } from "../../lib/rules";
import { cityGroups, lineGroups, type StationGroup } from "../../lib/station-groups";
import { departuresToward, type Station } from "../../lib/timetable";
import { legSecondsOf, tripMinutes } from "../../lib/travel-time";
import { reportTdx } from "../../service/health";
import { cachedBusEta, cachedBusRoute, cachedBusSchedule, cachedDepartures, cachedMetroDepartures, cachedMetroFare, cachedMetroNetwork, cachedMetroTravelTimes, cachedRoutes, cachedStations, cachedThsrFares, cachedTraFares } from "../../service/cached";
import { mapRead, problemOf, type Read } from "../../service/timetable";
import { BusResults } from "../components/bus-results";
import { MetroResults } from "../components/metro-results";
import { SearchForm } from "../components/search-form";
import { SearchShell } from "../components/search-shell";
import { TrainResults } from "../components/search-results";
import { frequentStations } from "../frequent-stations";
import { searchGate } from "../search-gate";
import { MAX_DAYS_AHEAD, canSearch, parseSearch, type SearchQuery } from "../search-query";
import type { TransitRoute } from "../../data/schema";

/** 只算左邊的查詢 我的路線在 transit-layout 只換網址參數時不重算 */
export function TransitPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <TransitSearch searchParams={searchParams} />
    </Suspense>
  );
}

export async function TransitSearch({ searchParams }: { searchParams: SearchParams }) {
  try {
    const user = await requireModule("transit");
    // 沒有金鑰時 layout 已經寫了要設定
    if (!hasTransitEnv()) return null;
    const now = new Date();
    const today = taipeiDateKey(now);
    const query = parseSearch(await searchParams, today);
    const routes = await cachedRoutes(user.id);
    const search = await searchParts(query, now, routes.length < ROUTE_LIMIT, routes);
    return (
      <SearchShell collapsible={search.collapsible}>
        <SearchForm query={query} stations={search.stations} groups={search.groups} frequent={frequentStations(routes, query.mode)} today={today} maxDate={addDaysToKey(today, MAX_DAYS_AHEAD)} />
        {search.results}
      </SearchShell>
    );
  } finally {
    // 查詢問完 TDX 才輪到常用路線
    searchGate().open();
  }
}

/** collapsible 是結果上有修改鈕 表單才能收起來 */
type SearchParts = { stations: Station[]; groups: StationGroup[]; results: ReactNode; collapsible: boolean };

const NO_STATIONS = { stations: [], groups: [], collapsible: false };

function searchParts(query: SearchQuery, now: Date, canAdd: boolean, routes: TransitRoute[]): Promise<SearchParts> {
  if (query.mode === "bus") return busSearch(query, now, canAdd);
  if (query.mode === "metro") return metroSearch(query, now, canAdd, routes);
  return railSearch(query.mode, query, now, canAdd, routes);
}

const listOf = <T,>(read: Read<T[] | null> | null): T[] => (read?.ok ? (read.data ?? []) : []);

/** 高鐵與台鐵 車站清單一天讀一次 班次與票價要選好起訖才查 台鐵的縣市在車站清單裡 */
async function railSearch(mode: "thsr" | "tra", query: SearchQuery, now: Date, canAdd: boolean, routes: TransitRoute[]): Promise<SearchParts> {
  const searching = canSearch(query);
  const [stations, results] = await Promise.all([cachedStations(mode, ""), searching ? cachedDepartures(mode, query.from, query.to, query.date) : null]);
  // 每分鐘只有 5 次 班次問完才問票價 不能讓多的資料佔掉次數
  const [cabins, traFares] = await Promise.all([searching && mode === "thsr" ? cachedThsrFares(query.from, query.to) : null, searching && mode === "tra" ? cachedTraFares(query.from, query.to) : null]);
  after(() => reportTdx(problemOf(stations, results, cabins, traFares)));
  const stationList = stations.ok ? stations.data : [];
  return {
    stations: stationList,
    groups: mode === "tra" ? cityGroups(stationList) : [],
    collapsible: results?.ok === true,
    results: (
      <>
        {!stations.ok && <p className="text-ink">車站資料暫時無法讀取</p>}
        {results && <TrainResults results={results} cabins={listOf(cabins)} traFares={listOf(traFares)} query={query} stations={stationList} now={now} canAdd={canAdd} saved={routes.filter((route) => route.mode === mode && route.originId === query.from && route.destinationId === query.to).map((route) => route.line)} />}
      </>
    ),
  };
}

/** 票價要問真的上下車的站 同名的站會換到另一條線的代碼 */
function fareOfLegs(legs: MetroLeg[]) {
  const system = fareSystemOf(legs);
  return system ? cachedMetroFare(system, legs[0].from.id, legs[legs.length - 1].to.id) : null;
}

const travelTimesOfLegs = (legs: MetroLeg[]) => Promise.all([...new Set(legs.map((leg) => leg.system))].map(async (system) => ({ system, read: await cachedMetroTravelTimes(system) })));

/** 路網一天讀一次 大家共用 路線在這裡算好 第一段問時刻表 票價與行車時間是多的 讀不到就不寫 */
async function metroSearch(query: SearchQuery, now: Date, canAdd: boolean, routes: TransitRoute[]): Promise<SearchParts> {
  const read = await cachedMetroNetwork();
  if (!read.ok) {
    after(() => reportTdx(read.problem));
    return { ...NO_STATIONS, results: <p className="text-ink">車站資料暫時無法讀取</p> };
  }
  const { network, missing } = read.data;
  const legs = canSearch(query) ? planRoute(network, query.from, query.to) : undefined;
  const first = legs?.[0];
  const planned = legs ?? [];
  // 一站每個方向都在裡面 只留搭得到要下車的站的車
  const departures = first ? mapRead(await cachedMetroDepartures(first.system, first.from.id, taipeiDateKey(now)), (all) => departuresToward(all, first.servedIds)) : null;
  // 每分鐘只有 5 次 班次問完才問票價與行車時間
  const [fare, times] = await Promise.all([fareOfLegs(planned), travelTimesOfLegs(planned)]);
  after(() => reportTdx(read.data.problem ?? problemOf(departures, fare, ...times.map((time) => time.read))));
  const timesBySystem = Object.fromEntries(times.map(({ system, read: time }) => [system, time.ok ? time.data : null]));
  const minutes = tripMinutes(planned, timesBySystem);
  const saved = first !== undefined && routes.some((route) => route.mode === "metro" && route.originId === first.from.id && route.destinationId === first.towardId);
  return {
    stations: network.stations,
    groups: lineGroups(network),
    collapsible: legs !== undefined,
    results: (
      <>
        {missing.length > 0 && <p className="text-ink">{missing.map((system) => METRO_SYSTEMS[system]).join("、")}暫時無法讀取</p>}
        {legs !== undefined && <MetroResults legs={legs} departures={departures} legSeconds={planned.map((leg) => legSecondsOf(leg, timesBySystem))} minutes={minutes} fare={fare?.ok ? fare.data : null} query={query} stations={network.stations} now={now} canAdd={canAdd} saved={saved} />}
      </>
    ),
  };
}

const minutesOfDay = (now: Date) => Number(formatTaipeiHourMinute(now).slice(0, 2)) * 60 + Number(formatTaipeiHourMinute(now).slice(3));

/** 路線先讀 查得到才讀到站時間與班距 打錯路線名稱不用多花額度 */
async function busSearch(query: SearchQuery, now: Date, canAdd: boolean): Promise<SearchParts> {
  if (!canSearch(query)) return { ...NO_STATIONS, results: null };
  const route = await cachedBusRoute(query.system, query.line);
  if (!route.ok || route.data.length === 0) return { ...NO_STATIONS, results: <BusResults route={route} eta={null} schedule={null} query={query} canAdd={canAdd} /> };
  const direction = route.data.find((candidate) => candidate.direction === query.direction)?.direction ?? route.data[0].direction;
  const [eta, schedule] = await Promise.all([cachedBusEta(query.system, query.line, direction), cachedBusSchedule(query.system, query.line, direction, taipeiDateKey(now), minutesOfDay(now))]);
  return { ...NO_STATIONS, collapsible: true, results: <BusResults route={route} eta={eta} schedule={schedule.ok ? schedule.data : null} query={query} canAdd={canAdd} /> };
}

function SearchSkeleton() {
  return (
    <LoadingState label="載入查詢…">
      <Skeleton className="h-64 rounded-2xl" />
    </LoadingState>
  );
}
