import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { EmptyState } from "@/core/ui/empty-state";
import { InfoTip } from "@/core/ui/info-tip";
import { MoreMenu } from "@/core/ui/more-menu";
import { Scene } from "@/core/ui/scene";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { County } from "../../lib/counties";
import { PLACE_HOME, placeHref, pickPlace, type PlaceTab } from "../place-tabs";
import { cachedCountyWeek, cachedPlaces, cachedSettings, cachedWorldWeek } from "../../service/cached";
import { deletePlaceAction } from "../actions";
import { AddPlaceButton } from "../components/place-form";
import { Flag, WeatherImage } from "../components/weather-images";
import { heroScene, todayText, weekRows, type WeekRow } from "../weekly-view";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function WeatherPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <div data-accent={info.accent}>
      <Suspense fallback={<WeatherPageSkeleton />}>
        <WeatherPageBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function weekOf(tab: PlaceTab) {
  if (tab.kind === "county") return cachedCountyWeek(tab.name as County);
  return cachedWorldWeek(tab.latitude ?? 0, tab.longitude ?? 0, tab.timezone ?? "auto");
}

/** 只讀選中的城市 其他城市點了才讀 省下氣象署與 Open-Meteo 的請求 */
export async function WeatherPageBody({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("weather");
  const [settings, places, params] = await Promise.all([cachedSettings(user.id), cachedPlaces(user.id), searchParams]);
  const tabs: PlaceTab[] = [
    ...(settings ? [{ key: PLACE_HOME, id: null, kind: "county" as const, name: settings.county, country: null, latitude: null, longitude: null, timezone: null }] : []),
    ...places.map(({ id, kind, name, country, latitude, longitude, timezone }) => ({ key: String(id), id, kind, name, country, latitude, longitude, timezone })),
  ];
  if (tabs.length === 0) return <EmptyState icon="cloud-sun" title="還沒有城市" hint="在首頁的天氣卡片選所在縣市，或新增想看的城市，台灣與國外都可以" action={<AddPlaceButton className="btn-primary" />} />;
  const selected = pickPlace(tabs, params.place);
  const week = await weekOf(selected);
  const rows = week ? weekRows(week) : [];
  const today = week?.[0];

  return (
    <>
      <Scene src={heroScene(today)} eager className="wx-hero">
        <div className="wx-hero-body">
          <div className="flex items-start gap-2">
            <nav aria-label="城市" {...DRAG_SCROLL} className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {tabs.map((tab) => (
                <Link key={tab.key} href={placeHref(tab.key)} scroll={false} aria-current={tab.key === selected.key ? "page" : undefined} className="wx-chip">
                  <Flag country={tab.country} size={18} />
                  {tab.name}
                </Link>
              ))}
              <AddPlaceButton />
            </nav>
            <InfoTip label="天氣頁的說明">資料來源：台灣是中央氣象署，國外是 Open-Meteo（CC BY 4.0）。最多 10 個城市，首頁的卡片維持一個縣市。</InfoTip>
            {selected.id !== null && (
              <MoreMenu label={`${selected.name}的選項`} triggerClassName="scene-button">
                <DeleteMenuItem action={deletePlaceAction} fields={{ id: selected.id }} confirmMessage={`確定刪除「${selected.name}」？`} label="刪除這個城市" deletedMessage="已刪除城市" />
              </MoreMenu>
            )}
          </div>
          <div>
            <h1 className="wx-city">
              <Flag country={selected.country} size={26} />
              {selected.name}
            </h1>
            {today ? (
              <>
                <p className="wx-temp">{today.high === null ? "--" : `${today.high}°`}</p>
                <p className="wx-today">{todayText(today)}</p>
              </>
            ) : (
              <p className="wx-today">預報暫時讀不到，稍後再試</p>
            )}
          </div>
        </div>
      </Scene>
      {rows.length > 0 && <WeekList rows={rows} />}
    </>
  );
}

function WeekList({ rows }: { rows: WeekRow[] }) {
  return (
    <ul aria-label="一週預報" className="card wx-week">
      {rows.map((row) => (
        <li key={row.date} className="wx-row">
          <span className="text-ink">{row.label}</span>
          <WeatherImage art={row.art} alt={row.weather ?? ""} size={32} />
          <span className="wx-rain">{row.rain ? `${row.rain}%` : ""}</span>
          <span className="wx-low">{row.low === null ? "" : `${row.low}°`}</span>
          <span aria-hidden className="wx-bar">
            <i style={{ left: `${row.left}%`, right: `${row.right}%` }} />
          </span>
          <span className="wx-high">{row.high === null ? "" : `${row.high}°`}</span>
        </li>
      ))}
    </ul>
  );
}

function WeatherPageSkeleton() {
  return (
    <LoadingState label="載入天氣…" className="stack">
      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </LoadingState>
  );
}
