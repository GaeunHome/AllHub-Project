import { COUNTIES, type County } from "./counties";
import type { WorldPlace } from "./weekly";

// 使用者要的 城市固定用這份清單 繁體名稱與座標都寫死 不再讓人搜尋別的城市
export const WORLD_CITIES: readonly WorldPlace[] = [
  { name: "東京", country: "jp", latitude: 35.6895, longitude: 139.6917, timezone: "Asia/Tokyo" },
  { name: "大阪", country: "jp", latitude: 34.6937, longitude: 135.5023, timezone: "Asia/Tokyo" },
  { name: "京都", country: "jp", latitude: 35.0116, longitude: 135.7681, timezone: "Asia/Tokyo" },
  { name: "札幌", country: "jp", latitude: 43.0618, longitude: 141.3545, timezone: "Asia/Tokyo" },
  { name: "福岡", country: "jp", latitude: 33.5904, longitude: 130.4017, timezone: "Asia/Tokyo" },
  { name: "沖繩（那霸）", country: "jp", latitude: 26.2124, longitude: 127.6809, timezone: "Asia/Tokyo" },
  { name: "首爾", country: "kr", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul" },
  { name: "釜山", country: "kr", latitude: 35.1796, longitude: 129.0756, timezone: "Asia/Seoul" },
  { name: "濟州", country: "kr", latitude: 33.4996, longitude: 126.5312, timezone: "Asia/Seoul" },
  { name: "香港", country: "hk", latitude: 22.3193, longitude: 114.1694, timezone: "Asia/Hong_Kong" },
  { name: "澳門", country: "mo", latitude: 22.1987, longitude: 113.5439, timezone: "Asia/Macau" },
  { name: "新加坡", country: "sg", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore" },
  { name: "曼谷", country: "th", latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok" },
  { name: "吉隆坡", country: "my", latitude: 3.139, longitude: 101.6869, timezone: "Asia/Kuala_Lumpur" },
  { name: "河內", country: "vn", latitude: 21.0278, longitude: 105.8342, timezone: "Asia/Ho_Chi_Minh" },
  { name: "胡志明市", country: "vn", latitude: 10.8231, longitude: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
  { name: "峇里島", country: "id", latitude: -8.4095, longitude: 115.1889, timezone: "Asia/Makassar" },
  { name: "雪梨", country: "au", latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney" },
  { name: "倫敦", country: "gb", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { name: "巴黎", country: "fr", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
  { name: "紐約", country: "us", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
  { name: "洛杉磯", country: "us", latitude: 34.0522, longitude: -118.2437, timezone: "America/Los_Angeles" },
];

export type PlaceChoice = { kind: "county"; name: County; country: null; latitude: null; longitude: null; timezone: null } | ({ kind: "world" } & WorldPlace);

const isCounty = (name: string): name is County => (COUNTIES as readonly string[]).includes(name);

/** 表單只送地點名稱 座標 時區與國碼一律用清單的值 */
export function parsePlaceChoice(name: string): { ok: true; value: PlaceChoice } | { ok: false; error: string } {
  if (isCounty(name)) return { ok: true, value: { kind: "county", name, country: null, latitude: null, longitude: null, timezone: null } };
  const place = WORLD_CITIES.find((city) => city.name === name);
  return place ? { ok: true, value: { kind: "world", ...place } } : { ok: false, error: "請選擇城市" };
}
