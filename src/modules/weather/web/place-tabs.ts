import type { WeatherPlace } from "../data/schema";

/** 首頁選的縣市排第一個 不是 weather_places 的列 不能在這裡刪 */
export const PLACE_HOME = "home";

export type PlaceTab = Pick<WeatherPlace, "kind" | "name" | "country" | "latitude" | "longitude" | "timezone"> & { key: string; id: number | null };

/** 網址上的城市只從自己的清單挑 別人的 id 或亂填都回第一個 */
export function pickPlace<T extends { key: string }>(tabs: readonly T[], requested: string | string[] | undefined): T {
  return tabs.find((tab) => tab.key === requested) ?? tabs[0];
}

export const placeHref = (key: string) => `/weather?place=${encodeURIComponent(key)}`;
