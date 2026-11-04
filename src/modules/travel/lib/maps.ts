// 使用者不想花錢 不接 Google 的付費 API 只解析貼上的連結與組出開地圖的網址
// 真實的連結格式還沒驗證 解析不出來時退回手動輸入

export type MapsPlace = { url: string; name: string | null; lat: number | null; lng: number | null };
export type RouteStop = { title: string; lat: number | null; lng: number | null };

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** 短網址要向 Google 問一次才知道是哪裡 只收這兩個網域 不會被導去抓別的地方 */
export function isShortMapsUrl(input: string): boolean {
  const url = parseUrl(input);
  if (!url || !SHORT_HOSTS.has(url.hostname)) return false;
  return url.hostname === "maps.app.goo.gl" || url.pathname.startsWith("/maps/");
}

export function isFullMapsUrl(input: string): boolean {
  const url = parseUrl(input);
  if (!url) return false;
  return url.hostname === "maps.google.com" || (GOOGLE_HOST.test(url.hostname) && url.pathname.startsWith("/maps"));
}

export const isMapsUrl = (input: string): boolean => isShortMapsUrl(input) || isFullMapsUrl(input);

function decodeName(segment: string): string | null {
  try {
    const name = decodeURIComponent(segment.replace(/\+/g, " ")).trim();
    return name || null;
  } catch {
    return null;
  }
}

function coordinatesOf(text: string): { lat: number; lng: number } | null {
  // !3d !4d 是地點本身 @ 只是畫面的中心 兩個都有時用地點的
  const match = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(text) ?? /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(text) ?? /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/.exec(text);
  if (!match) return null;
  const [lat, lng] = [Number(match[1]), Number(match[2])];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** 看得出來的才填 名稱讀不到時由使用者自己打 */
export function parseMapsUrl(input: string): MapsPlace | null {
  if (!isMapsUrl(input)) return null;
  const url = input.trim();
  const parsed = new URL(url);
  const place = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
  const query = parsed.searchParams.get("q");
  const textQuery = query && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(query) ? query : null;
  const coordinates = coordinatesOf(url);
  return { url, name: place ? decodeName(place[1]) : textQuery, lat: coordinates?.lat ?? null, lng: coordinates?.lng ?? null };
}

const spot = (stop: RouteStop) => (stop.lat !== null && stop.lng !== null ? `${stop.lat},${stop.lng}` : stop.title);

/** 沒貼連結的點 用名稱加目的地查 */
export function mapsSearchUrl(title: string, destination: string | null): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: [title, destination].filter(Boolean).join(" ") })}`;
}

/** 兩個點之間怎麼走 大眾運輸優先 查到的時間由使用者填回來 */
export function directionsUrl(from: RouteStop, to: RouteStop): string {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: spot(from), destination: spot(to), travelmode: "transit" })}`;
}

/** Google Maps 的網址最多帶 9 個中途點 多的略過 */
const MAX_WAYPOINTS = 9;

/** 整天的路線 大眾運輸模式不支援中途點 所以不指定交通方式 */
export function dayRouteUrl(stops: readonly RouteStop[]): string | null {
  if (stops.length < 2) return null;
  const middle = stops.slice(1, -1).slice(0, MAX_WAYPOINTS);
  const params = new URLSearchParams({ api: "1", origin: spot(stops[0]), destination: spot(stops[stops.length - 1]) });
  if (middle.length > 0) params.set("waypoints", middle.map(spot).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
