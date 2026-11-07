import { cache } from "react";
import type { County } from "../lib/counties";
import { fromToday, type HourPoint } from "../lib/weekly";
import { cachedCountyHours, cachedCountyWeek, cachedWorldWeek } from "../service/cached";
import type { WorldWeek } from "../service/weather";
import type { PlaceTab } from "./place-tabs";

// 天氣頁的各區塊各自串流 同一次請求裡同一個城市只讀一次

const TAIPEI_OFFSET_SECONDS = 8 * 3600;

/** 台灣的每小時要另外讀 所以 hours 是 null 國外的跟一週預報同一個回應 */
export type PlaceWeek = Omit<WorldWeek, "hours"> & { hours: WorldWeek["hours"] | null };

const countyWeek = cache((county: County) => cachedCountyWeek(county));
const worldWeek = cache((latitude: number, longitude: number, timezone: string) => cachedWorldWeek(latitude, longitude, timezone));
const countyHours = cache((county: County) => cachedCountyHours(county));

async function readWeek(tab: PlaceTab): Promise<PlaceWeek | null> {
  if (tab.kind !== "county") return worldWeek(tab.latitude ?? 0, tab.longitude ?? 0, tab.timezone ?? "auto");
  const days = await countyWeek(tab.name as County);
  return days && { days, hours: null, utcOffsetSeconds: TAIPEI_OFFSET_SECONDS };
}

/** 一週從當地的今天算 半夜讀到的第一段還是昨晚 */
export async function weekOf(tab: PlaceTab): Promise<PlaceWeek | null> {
  const week = await readWeek(tab);
  return week && { ...week, days: fromToday(week.days, new Date(), week.utcOffsetSeconds) };
}

/** 一週的點開與接下來 24 小時共用 讀不到是空的 */
export async function hoursOf(county: County | null, week: PlaceWeek): Promise<HourPoint[]> {
  return week.hours ?? (county && (await countyHours(county))) ?? [];
}
