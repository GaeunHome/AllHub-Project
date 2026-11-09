import Link from "next/link";
import type { ReactNode } from "react";
import { SectionTitle } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { WeekDay } from "../../lib/weekly";
import { placeHref, type PlaceTab } from "../place-tabs";
import { weekOf } from "../place-week";
import { weatherArt } from "../weather-view";
import { PendingPlace } from "./pending-place";
import { Flag, WeatherImage } from "./weather-images";

// 使用者要的 清單裡每個城市一張小卡片 點了跟城市膠囊一樣切換
// 預報不分使用者 照縣市或座標快取 大家共用一份

function Frame({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="wx-cities" className="stack wx-wide">
      <SectionTitle id="wx-cities">我的城市</SectionTitle>
      {children}
    </section>
  );
}

const degrees = (value: number | null) => (value === null ? "--" : `${value}°`);

function Today({ today }: { today: WeekDay | undefined }) {
  if (!today) return <p className="text-ink">預報暫時無法讀取</p>;
  return (
    <>
      <p className="flex items-center gap-2">
        <WeatherImage art={weatherArt(today.weather ?? "", false)} alt="" size={40} />
        <span className="text-xl font-semibold text-ink tabular-nums">
          <span className="sr-only">最高</span>
          {degrees(today.high)}
        </span>
        <span className="text-ink-soft tabular-nums">
          <span className="sr-only">最低</span>
          {degrees(today.low)}
        </span>
      </p>
      {today.weather && <p className="text-ink">{today.weather}</p>}
    </>
  );
}

function CityName({ tab }: { tab: PlaceTab }) {
  return (
    <span className="wx-city-name">
      <Flag country={tab.country} size={18} />
      {tab.name}
    </span>
  );
}

/** 每個城市同時讀 正在看的那一個頁面已經讀過 同一次請求不會再問 */
export async function CityOverview({ tabs, selectedKey }: { tabs: PlaceTab[]; selectedKey: string }) {
  const weeks = await Promise.all(tabs.map((tab) => weekOf(tab)));
  return (
    <Frame>
      <ul className="wx-cities">
        {tabs.map((tab, index) => (
          <li key={tab.key}>
            <Link href={placeHref(tab.key)} aria-current={tab.key === selectedKey ? "page" : undefined} className="wx-city-card">
              <CityName tab={tab} />
              <Today today={weeks[index]?.days[0]} />
              <PendingPlace />
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** 名稱先出現 天氣讀到才補上 卡片的大小不變 */
export function CityOverviewSkeleton({ tabs }: { tabs: PlaceTab[] }) {
  return (
    <Frame>
      <LoadingState label="載入每個城市的天氣…">
        <ul className="wx-cities">
          {tabs.map((tab) => (
            <li key={tab.key} className="wx-city-card">
              <CityName tab={tab} />
              <Skeleton className="h-10 w-28 rounded-lg" />
              <Skeleton className="h-4 w-20" />
            </li>
          ))}
        </ul>
      </LoadingState>
    </Frame>
  );
}
