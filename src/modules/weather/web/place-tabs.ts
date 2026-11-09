import type { WeatherPlace } from "../data/schema";

/** 首頁選的縣市排第一個 不是 weather_places 的列 不能在這裡刪 */
export const PLACE_HOME = "home";

export type PlaceTab = Pick<WeatherPlace, "kind" | "name" | "country" | "latitude" | "longitude" | "timezone"> & { key: string; id: number | null };

/**
 * 首頁的縣市排第一個 存著的城市跟它一樣時不再列一次 資料留著
 * 使用者回報過 先加了桃園再把首頁改成桃園 出現兩個桃園
 */
export function placeTabs(settings: { county: string } | null, places: readonly WeatherPlace[]): PlaceTab[] {
  const home: PlaceTab[] = settings ? [{ key: PLACE_HOME, id: null, kind: "county", name: settings.county, country: null, latitude: null, longitude: null, timezone: null }] : [];
  const others = places.filter((place) => !(settings && place.kind === "county" && place.name === settings.county));
  return [...home, ...others.map(({ id, kind, name, country, latitude, longitude, timezone }) => ({ key: String(id), id, kind, name, country, latitude, longitude, timezone }))];
}

/** 網址上的城市只從自己的清單挑 別人的 id 或亂填都回第一個 */
export function pickPlace<T extends { key: string }>(tabs: readonly T[], requested: string | string[] | undefined): T {
  return tabs.find((tab) => tab.key === requested) ?? tabs[0];
}

export const placeHref = (key: string) => `/weather?place=${encodeURIComponent(key)}`;
