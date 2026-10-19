import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import type { Forecast } from "../lib/forecast";
import { weatherTags } from "./cache-tags";
import { getSettings, type WeatherSettings } from "./settings";
import { fetchForecast, fetchStations } from "./weather";

// 只給頁面用 userId 是頁面從 session 拿到的登入者
// 預報與空氣品質不分使用者 照縣市共用 讀不到時短效期 幾分鐘後再試

/** 縣市與下雨通知的開關 還沒選過縣市是 null */
export async function cachedSettings(userId: string): Promise<WeatherSettings | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(weatherTags.settings);
  return getSettings(userId);
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

/** 空氣品質每小時更新 全台一份 */
export async function cachedStations(): Promise<Station[] | null> {
  "use cache: remote";
  cacheTag(weatherTags.external);
  const stations = await fetchStations();
  if (stations) cacheLife("records");
  else cacheLife("external");
  return stations;
}
