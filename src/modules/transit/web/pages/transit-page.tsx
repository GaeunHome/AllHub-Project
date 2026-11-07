import { after } from "next/server";
import { Suspense, type ReactNode } from "react";
import { requireModule } from "@/core/auth";
import { hasTransitEnv } from "@/core/env";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { DAY_MS, formatTaipeiHourMinute, taipeiDateKey } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { PageBanner } from "@/core/ui/page-banner";
import { SectionTitle } from "@/core/ui/page-header";
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
import { RouteCard, TrackedCard } from "../components/route-cards";
import { SearchForm } from "../components/search-form";
import { SearchShell } from "../components/search-shell";
import { SideSync, SideToggle } from "../components/side-toggle";
import { SortableRoutes } from "../components/sortable-routes";
import { TrainResults } from "../components/search-results";
import { frequentStations } from "../frequent-stations";
import { loadBoards } from "../route-boards";
import { routeLabel } from "../transit-view";
import { MAX_DAYS_AHEAD, canSearch, parseSearch, type SearchQuery } from "../search-query";
import type { TransitRoute } from "../../data/schema";

const BANNER = "/images/scenes/banner-transit.svg";
// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function TransitPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <PageBanner
        image={BANNER}
        icon={<Icon src={info.icon} />}
        title={
          <span className="inline-flex items-center gap-1">
            交通
            <InfoTip label="交通的說明">資料來自交通部 TDX，票價是成人全票，捷運總時間是估的</InfoTip>
          </span>
        }
      />
      <Suspense fallback={<TransitSkeleton />}>
        <TransitBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

export async function TransitBody({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("transit");
  if (!hasTransitEnv()) return <EmptyState icon="bus" title="還沒設定交通資料的金鑰" hint="站長在 Vercel 的環境變數加上 TDX_CLIENT_ID 與 TDX_CLIENT_SECRET 就會顯示" />;
  const now = new Date();
  const today = taipeiDateKey(now);
  const query = parseSearch(await searchParams, today);
  const routes = await cachedRoutes(user.id);
  const search = await searchParts(query, now, routes.length < ROUTE_LIMIT, routes);

  return (
    <div className="trn-layout">
      <div className="trn-main">
        <SearchShell collapsible={search.collapsible}>
          <SearchForm query={query} stations={search.stations} groups={search.groups} frequent={frequentStations(routes, query.mode)} today={today} maxDate={taipeiDateKey(new Date(now.getTime() + MAX_DAYS_AHEAD * DAY_MS))} />
          {search.results}
        </SearchShell>
      </div>
      {/* 手機上一眼要看到倒數 所以排在查詢前面 還沒有路線時空狀態不能擋在前面 */}
      <aside aria-labelledby="transit-side-title" data-empty={routes.length === 0 ? "" : undefined} className="trn-side no-scrollbar">
        <div className="trn-side-head">
          <h2 id="transit-side-title" className="trn-side-title">
            我的路線
          </h2>
          <SideToggle controls="transit-side-body" />
        </div>
        <div id="transit-side-body" className="trn-side-body">
          {/* TDX 每分鐘只有 5 次 查詢先問 卡片要等下一分鐘時表單已經能用 */}
          <Suspense fallback={<BoardsSkeleton />}>
            <RouteBoards routes={routes} now={now} />
          </Suspense>
        </div>
      </aside>
      <SideSync />
    </div>
  );
}

async function RouteBoards({ routes, now }: { routes: TransitRoute[]; now: Date }) {
  const boards = await loadBoards(routes, now);
  const tracked = boards.filter((board) => board.route.tracked);
  const others = boards.filter((board) => !board.route.tracked);

  return (
    <>
      {tracked.length > 0 && (
        <section aria-labelledby="transit-tracked" className="stack">
          <SectionTitle id="transit-tracked">追蹤中</SectionTitle>
          <div className="trn-tracked">
            {tracked.map((board) => (
              <TrackedCard key={board.route.id} {...board} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="transit-routes" className="stack">
        <SectionTitle id="transit-routes">常用路線</SectionTitle>
        {routes.length === 0 ? (
          <EmptyState compact icon="bus" title="還沒有常用路線" hint="查到班次後按星星，就會存在這裡" />
        ) : (
          <SortableRoutes
            items={others.map((board) => ({ id: board.route.id, label: routeLabel(board.route), node: <RouteCard {...board} /> }))}
            after={
              routes.length < ROUTE_LIMIT && (
                <a href="#transit-search" className="trn-add">
                  <Icon name="plus" className="size-4" />
                  新增常用路線
                </a>
              )
            }
          />
        )}
      </section>
    </>
  );
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

function BoardsSkeleton() {
  return (
    <LoadingState label="載入常用路線…">
      <Skeleton className="h-40 rounded-2xl" />
    </LoadingState>
  );
}

function TransitSkeleton() {
  return (
    <LoadingState label="載入交通…" className="page-stack">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </LoadingState>
  );
}
