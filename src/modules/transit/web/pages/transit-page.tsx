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
import { ROUTE_LIMIT } from "../../lib/rules";
import { cityGroups, lineGroups, type StationGroup } from "../../lib/station-groups";
import type { Station } from "../../lib/timetable";
import { reportTdx } from "../../service/health";
import { cachedBusEta, cachedBusRoute, cachedBusSchedule, cachedDepartures, cachedDirections, cachedMetroLines, cachedRoutes, cachedStations } from "../../service/cached";
import { RouteCard, TrackedCard } from "../components/route-cards";
import { SearchForm } from "../components/search-form";
import { BusResults, TrainResults } from "../components/search-results";
import { frequentStations } from "../frequent-stations";
import { loadBoards } from "../route-boards";
import { MAX_DAYS_AHEAD, canSearch, parseSearch, type SearchQuery } from "../search-query";

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
            <InfoTip label="交通的說明">資料來自交通部 TDX。倒數每 5 秒更新一次，是用時刻表算的；追蹤中的台鐵與捷運在開車前 30 分鐘內每分鐘校正，高鐵沒有即時資料，照時刻表。捷運的即時資料只到分鐘，公車看預估到站的時間。</InfoTip>
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
  const canAdd = routes.length < ROUTE_LIMIT;
  const [boards, search] = await Promise.all([loadBoards(routes, now), query.mode === "bus" ? busSearch(query, now, canAdd) : railSearch(query, now, canAdd, today)]);
  const tracked = boards.filter((board) => board.route.tracked);
  const others = boards.filter((board) => !board.route.tracked);

  return (
    <div className="page-stack">
      {/* 手機上一眼要看到倒數 查詢表單很高 排到追蹤的後面 */}
      <div className="page-stack max-sm:order-2">
        <SearchForm query={query} stations={search.stations} groups={search.groups} frequent={frequentStations(routes, query)} directions={search.directions} today={today} maxDate={taipeiDateKey(new Date(now.getTime() + MAX_DAYS_AHEAD * DAY_MS))} />
        {search.results}
      </div>
      {tracked.length > 0 && (
        <section aria-labelledby="transit-tracked" className="stack max-sm:order-1">
          <SectionTitle id="transit-tracked">追蹤中</SectionTitle>
          <div className="trn-tracked">
            {tracked.map((board) => (
              <TrackedCard key={board.route.id} {...board} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="transit-routes" className="stack max-sm:order-3">
        <SectionTitle id="transit-routes">常用路線</SectionTitle>
        {routes.length === 0 ? (
          <EmptyState compact icon="bus" title="還沒有常用路線" hint="用上面的查詢找到班次後，按「加到常用路線」" />
        ) : (
          <div className="trn-grid">
            {others.map((board) => (
              <RouteCard key={board.route.id} {...board} />
            ))}
            {canAdd && (
              <a href="#transit-search" className="trn-add">
                <Icon name="plus" className="size-4" />
                新增常用路線
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type SearchParts = { stations: Station[]; groups: StationGroup[]; directions: Station[]; results: ReactNode };

/** 高鐵 台鐵與捷運 車站清單一天讀一次 班次要選好起訖才查 台鐵的縣市在車站清單裡 只有捷運要多讀路線 */
async function railSearch(query: SearchQuery, now: Date, canAdd: boolean, today: string): Promise<SearchParts> {
  const { mode } = query;
  if (mode === "bus") return { stations: [], groups: [], directions: [], results: null };
  const metro = mode === "metro";
  const system = metro ? query.system : "";
  const [stations, lines, directions, results] = await Promise.all([cachedStations(mode, system), metro ? cachedMetroLines(system) : null, metro && query.from ? cachedDirections(system, query.from) : null, canSearch(query) ? cachedDepartures(mode, system, query.from, query.to, metro ? today : query.date) : null]);
  const problem = !stations.ok ? stations.problem : lines?.ok === false ? lines.problem : null;
  after(() => reportTdx(problem));
  const stationList = stations.ok ? stations.data : [];
  const directionList = directions?.ok ? directions.data : [];
  return {
    stations: stationList,
    groups: mode === "tra" ? cityGroups(stationList) : lines?.ok ? lineGroups(system, stationList, lines.data) : [],
    directions: directionList,
    results: (
      <>
        {!stations.ok && <p className="text-ink">車站資料暫時讀不到，稍後再試</p>}
        {results && <TrainResults results={results} query={query} stations={stationList} directions={directionList} now={now} canAdd={canAdd} />}
      </>
    ),
  };
}

const minutesOfDay = (now: Date) => Number(formatTaipeiHourMinute(now).slice(0, 2)) * 60 + Number(formatTaipeiHourMinute(now).slice(3));

/** 路線先讀 查得到才讀到站時間與班距 打錯路線名稱不用多花額度 */
async function busSearch(query: SearchQuery, now: Date, canAdd: boolean): Promise<SearchParts> {
  if (!canSearch(query)) return { stations: [], groups: [], directions: [], results: null };
  const route = await cachedBusRoute(query.system, query.line);
  if (!route.ok || route.data.length === 0) return { stations: [], groups: [], directions: [], results: <BusResults route={route} eta={null} schedule={null} query={query} canAdd={canAdd} /> };
  const direction = route.data.find((candidate) => candidate.direction === query.direction)?.direction ?? route.data[0].direction;
  const [eta, schedule] = await Promise.all([cachedBusEta(query.system, query.line, direction), cachedBusSchedule(query.system, query.line, direction, taipeiDateKey(now), minutesOfDay(now))]);
  return { stations: [], groups: [], directions: [], results: <BusResults route={route} eta={eta} schedule={schedule.ok ? schedule.data : null} query={query} canAdd={canAdd} /> };
}

function TransitSkeleton() {
  return (
    <LoadingState label="載入交通…" className="page-stack">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </LoadingState>
  );
}
