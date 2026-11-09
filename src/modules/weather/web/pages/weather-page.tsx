import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { InfoTip } from "@/core/ui/info-tip";
import { Scene } from "@/core/ui/scene";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { cityPhoto, photoCredit } from "../../lib/city-photos";
import type { County } from "../../lib/counties";
import { upcomingHours, type WeekDay } from "../../lib/weekly";
import { cachedPlaces, cachedSettings } from "../../service/cached";
import { AirAndWarnings, AirAndWarningsSkeleton, airParts } from "../components/air-and-warnings";
import { CityOverview, CityOverviewSkeleton } from "../components/city-overview";
import { ManagePlacesButton } from "../components/manage-places";
import { NextHours, NextHoursSkeleton } from "../components/next-hours";
import { PlaceChips } from "../components/place-chips";
import { AddPlaceButton } from "../components/place-form";
import { TodayDetails, TodayDetailsWithHours, detailsOf } from "../components/today-details";
import { Flag } from "../components/weather-images";
import { WeekList } from "../components/week-list";
import { PLACE_HOME, pickPlace, type PlaceTab } from "../place-tabs";
import { hoursOf, weekOf, type PlaceWeek } from "../place-week";
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

/** 照片與一週先出現 下面的區塊各自串流 慢或讀不到都不擋上面 */
export async function WeatherPageBody({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("weather");
  const [settings, places, params] = await Promise.all([cachedSettings(user.id), cachedPlaces(user.id), searchParams]);
  const tabs: PlaceTab[] = [
    ...(settings ? [{ key: PLACE_HOME, id: null, kind: "county" as const, name: settings.county, country: null, latitude: null, longitude: null, timezone: null }] : []),
    ...places.map(({ id, kind, name, country, latitude, longitude, timezone }) => ({ key: String(id), id, kind, name, country, latitude, longitude, timezone })),
  ];
  if (tabs.length === 0) return <EmptyState icon="cloud-sun" title="還沒有城市" hint="在首頁的天氣卡片選所在縣市，或新增想看的城市，台灣與國外都可以" action={<AddPlaceButton />} />;
  const selected = pickPlace(tabs, params.place);
  const county = selected.kind === "county" ? (selected.name as County) : null;
  const week = await weekOf(selected);
  const rows = week ? weekRows(week.days) : [];
  const today = week?.days[0];
  // 國外的每小時已經在同一個回應裡 台灣的等氣象署的每小時讀到再補上
  const tiles = today && week ? detailsOf(today.details, week, week.hours ?? []) : [];
  // 空氣品質與特報只有台灣的縣市 跟今天的細節並排 少了一個時另一個撐滿整列
  const air = county !== null && airParts() !== null;

  return (
    <div className="wx-page">
      <div className={rows.length > 0 ? "wx-layout" : undefined}>
        <WeatherHero tabs={tabs} selected={selected} today={today} />
        {week && rows.length > 0 && (
          // 一週先出現 每小時讀到了才能點開 氣象署慢或讀不到都不影響一週預報
          <Suspense fallback={<WeekList rows={rows} hours={{}} />}>
            <WeekWithHours rows={rows} county={county} week={week} />
          </Suspense>
        )}
      </div>
      <div className="wx-more">
        {/* 使用者選的 24 小時與今天的細節疊在左欄 右欄是空氣品質與特報 國外沒有右欄就撐滿 */}
        {week && (
          <div className={air ? "wx-column" : "wx-column wx-wide"}>
            <Suspense fallback={<NextHoursSkeleton />}>
              <NextHours county={county} week={week} />
            </Suspense>
            {today && tiles.length > 0 && (
              <Suspense fallback={<TodayDetails tiles={tiles} />}>
                <TodayDetailsWithHours county={county} week={week} details={today.details} />
              </Suspense>
            )}
          </div>
        )}
        {county && air && (
          <Suspense fallback={<AirAndWarningsSkeleton wide={!week} />}>
            <AirAndWarnings county={county} wide={!week} />
          </Suspense>
        )}
        {/* 只有一個城市時跟上面的大圖重複 */}
        {tabs.length > 1 && (
          <Suspense fallback={<CityOverviewSkeleton tabs={tabs} />}>
            <CityOverview tabs={tabs} selectedKey={selected.key} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/** 城市的照片 上面疊著城市膠囊 今天的最高溫與天氣 */
function WeatherHero({ tabs, selected, today }: { tabs: PlaceTab[]; selected: PlaceTab; today: WeekDay | undefined }) {
  const photo = cityPhoto(selected.name);
  return (
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
            <p className="wx-today">預報暫時無法讀取</p>
          )}
        </div>
      </div>
    </Scene>
  );
}

/** 台灣的每小時跟接下來 24 小時共用同一次讀取 */
export async function WeekWithHours({ rows, county, week }: { rows: WeekRow[]; county: County | null; week: PlaceWeek }) {
  const hours = await hoursOf(county, week);
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
