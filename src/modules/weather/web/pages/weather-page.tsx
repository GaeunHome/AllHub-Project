import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { InfoTip } from "@/core/ui/info-tip";
import { Scene } from "@/core/ui/scene";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { cityPhoto, photoCredit } from "../../lib/city-photos";
import type { County } from "../../lib/counties";
import { fromToday, upcomingHours } from "../../lib/weekly";
import type { WorldWeek } from "../../service/weather";
import { PLACE_HOME, pickPlace, type PlaceTab } from "../place-tabs";
import { cachedCountyHours, cachedCountyWeek, cachedPlaces, cachedSettings, cachedWorldWeek } from "../../service/cached";
import { AddPlaceButton } from "../components/place-form";
import { ManagePlacesButton } from "../components/manage-places";
import { PlaceChips } from "../components/place-chips";
import { Flag } from "../components/weather-images";
import { WeekList } from "../components/week-list";
import { heroImage, hourColumns, todayText, weekRows, type WeekRow } from "../weekly-view";

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

const TAIPEI_OFFSET_SECONDS = 8 * 3600;

/** 台灣的每小時要另外讀 所以 hours 是 null 國外的跟一週預報同一個回應 */
type PlaceWeek = Omit<WorldWeek, "hours"> & { hours: WorldWeek["hours"] | null };

async function readWeek(tab: PlaceTab): Promise<PlaceWeek | null> {
  if (tab.kind !== "county") return cachedWorldWeek(tab.latitude ?? 0, tab.longitude ?? 0, tab.timezone ?? "auto");
  const days = await cachedCountyWeek(tab.name as County);
  return days && { days, hours: null, utcOffsetSeconds: TAIPEI_OFFSET_SECONDS };
}

async function weekOf(tab: PlaceTab): Promise<PlaceWeek | null> {
  const week = await readWeek(tab);
  return week && { ...week, days: fromToday(week.days, new Date(), week.utcOffsetSeconds) };
}

/** 只讀選中的城市 其他城市點了才讀 省下氣象署與 Open-Meteo 的請求 */
export async function WeatherPageBody({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("weather");
  const [settings, places, params] = await Promise.all([cachedSettings(user.id), cachedPlaces(user.id), searchParams]);
  const tabs: PlaceTab[] = [
    ...(settings ? [{ key: PLACE_HOME, id: null, kind: "county" as const, name: settings.county, country: null, latitude: null, longitude: null, timezone: null }] : []),
    ...places.map(({ id, kind, name, country, latitude, longitude, timezone }) => ({ key: String(id), id, kind, name, country, latitude, longitude, timezone })),
  ];
  if (tabs.length === 0) return <EmptyState icon="cloud-sun" title="還沒有城市" hint="在首頁的天氣卡片選所在縣市，或新增想看的城市，台灣與國外都可以" action={<AddPlaceButton />} />;
  const selected = pickPlace(tabs, params.place);
  const week = await weekOf(selected);
  const rows = week ? weekRows(week.days) : [];
  const today = week?.days[0];
  const photo = cityPhoto(selected.name);

  return (
    <div className={rows.length > 0 ? "wx-layout" : undefined}>
      <Scene src={heroImage(selected.name, today)} eager className="wx-hero">
        <div className="wx-hero-body">
          <div className="flex items-center gap-2">
            <PlaceChips tabs={tabs} selectedKey={selected.key} />
            <ManagePlacesButton tabs={tabs} />
            <InfoTip label="天氣頁的說明">
              資料來源：中央氣象署、Open-Meteo（CC BY 4.0）{photo && `，${photoCredit(photo)}`}
            </InfoTip>
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
      {week && rows.length > 0 && (
        // 一週先出現 每小時讀到了才能點開 氣象署慢或讀不到都不影響一週預報
        <Suspense fallback={<WeekList rows={rows} hours={{}} />}>
          <WeekWithHours rows={rows} county={selected.kind === "county" ? (selected.name as County) : null} week={week} />
        </Suspense>
      )}
    </div>
  );
}

export async function WeekWithHours({ rows, county, week }: { rows: WeekRow[]; county: County | null; week: PlaceWeek }) {
  const hours = week.hours ?? (county && (await cachedCountyHours(county))) ?? [];
  return <WeekList rows={rows} hours={hourColumns(upcomingHours(hours, new Date(), week.utcOffsetSeconds))} />;
}

function WeatherPageSkeleton() {
  return (
    <LoadingState label="載入天氣…" className="wx-layout">
      <Skeleton className="h-96 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </LoadingState>
  );
}
