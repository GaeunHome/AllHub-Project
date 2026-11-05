import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import type { Forecast } from "../lib/forecast";
import type { Warning } from "../lib/warnings";
import type { WeekDay, WorldPlace } from "../lib/weekly";
import type { WeatherPlace } from "../data/schema";
import { weatherTags } from "./cache-tags";
import { listPlaces } from "./places";
import { getSettings, type WeatherSettings } from "./settings";
import { fetchCountyWeek, fetchForecast, fetchStations, fetchWarnings, fetchWorldWeek } from "./weather";

// 只給頁面用 userId 是頁面從 session 拿到的登入者
// 預報 特報與空氣品質不分使用者 照縣市共用 讀不到時短效期 幾分鐘後再試

/** 縣市與兩種通知的開關 還沒選過縣市是 null */
export async function cachedSettings(userId: string): Promise<WeatherSettings | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(weatherTags.settings);
  return getSettings(userId);
}

export async function cachedPlaces(userId: string): Promise<WeatherPlace[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(weatherTags.places);
  return listPlaces(userId);
}

export async function cachedCountyWeek(county: County): Promise<WeekDay[] | null> {
  "use cache: remote";
  cacheTag(weatherTags.external);
  const week = await fetchCountyWeek(county);
  if (week && week.length > 0) cacheLife("records");
  else cacheLife("external");
  return week;
}

/** 座標就是 key 同一個城市大家共用一份 才不會用掉 Open-Meteo 的額度 */
export async function cachedWorldWeek(latitude: number, longitude: number, timezone: WorldPlace["timezone"]): Promise<WeekDay[] | null> {
  "use cache: remote";
  cacheTag(weatherTags.external);
  const week = await fetchWorldWeek({ latitude, longitude, timezone });
  if (week && week.length > 0) cacheLife("records");
  else cacheLife("external");
  return week;
}

/** 氣象署一天更新好幾次 半小時重讀一次 */
export async function cachedForecast(county: County): Promise<Forecast | null> {
  "use cache: remote";
  cacheTag(weatherTags.external);
  const forecast = await fetchForecast(county);
  if (forecast) cacheLife("records");
  else cacheLife("external");
  return forecast;
}

/** 特報隨時會發 讀到讀不到都幾分鐘後再讀 沒有特報是空陣列 讀不到是 null */
export async function cachedWarnings(county: County): Promise<Warning[] | null> {
  "use cache: remote";
  cacheLife("external");
  cacheTag(weatherTags.external);
  const warnings = await fetchWarnings(county);
  return warnings && (warnings.get(county) ?? []);
}

/** 空氣品質每小時更新 全台一份 */
export async function cachedStations(): Promise<Station[] | null> {
  "use cache: remote";
  cacheTag(weatherTags.external);
  const stations = await fetchStations();
  if (stations) cacheLife("records");
  else cacheLife("external");
  return stations;
}
