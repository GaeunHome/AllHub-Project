import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { RateDay, RateTable } from "../lib/rates";
import { ratesTag, travelTags, usersTag } from "./cache-tags";
import { fetchRates } from "./rates";
import { listTrips, todayTrip, tripDetail, type TripDetail, type TripSummary } from "./trips";

// 只給頁面用 userId 是頁面從 session 拿到的登入者
// 不是成員時查不到 快取的 key 含 userId 所以別人讀不到這一份

export async function cachedTrips(userId: string): Promise<TripSummary[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(travelTags.trips, travelTags.members);
  return listTrips(userId);
}

export async function cachedTrip(userId: string, tripId: number): Promise<TripDetail | null> {
  "use cache: remote";
  cacheLife("db");
  // 同行的人改名字或頭像也要更新
  cacheTag(...Object.values(travelTags), usersTag);
  return tripDetail(userId, tripId);
}

/** today 是參數 過了午夜換一份 */
export async function cachedTodayTrip(userId: string, today: string): Promise<TripSummary | null> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(travelTags.trips, travelTags.members, travelTags.items);
  return todayTrip(userId, today);
}

/** 匯率大家共用一份 過去的日期不會再變 最新的一天更新一次 */
export async function cachedRates(day: RateDay): Promise<RateTable | null> {
  "use cache: remote";
  cacheTag(ratesTag);
  const table = await fetchRates(day);
  if (!table) cacheLife("external");
  else if (day === "latest") cacheLife("quotes");
  else cacheLife("stations");
  return table;
}
