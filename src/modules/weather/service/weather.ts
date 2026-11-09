import "server-only";
import { weatherEnv } from "@/core/env";
import { readExternalJson } from "@/core/external-url";
import { logMissing } from "@/core/json";
import { parseStations, type Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import { parseForecast, type Forecast } from "../lib/forecast";
import { parseWarnings, type Warning } from "../lib/warnings";
import { parseCwaHours, parseCwaWeek, parseOpenMeteoHours, parseOpenMeteoWeek, type HourPoint, type WeekDay, type WorldPlace } from "../lib/weekly";

// 授權碼只在伺服器用 不進快取的 key 也不進回傳值

const FORECAST_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001";
const WARNING_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-001";
const AQI_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432";
const WEEK_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091";
const HOURS_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-089";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEEK_DAYS = "7";
// 首頁在等 等不到就先顯示讀不到
const TIMEOUT_MS = 8_000;
// 排程沒有人在等 全台的回應也比較大 多等一點
export const ALL_COUNTIES_TIMEOUT_MS = 15_000;

/** 這兩份資料的參數是大寫開頭 跟其他的不一樣 */
async function readCountyJson(endpoint: string, what: string, county: County, fetchImpl?: typeof fetch): Promise<unknown> {
  const key = weatherEnv().CWA_API_KEY;
  if (!key) return null;
  const url = new URL(endpoint);
  url.searchParams.set("Authorization", key);
  url.searchParams.set("LocationName", county);
  url.searchParams.set("format", "JSON");
  return readJson(url, what, fetchImpl);
}

/** 台灣的一週預報 讀不到或沒有授權碼回 null */
export async function fetchCountyWeek(county: County, fetchImpl?: typeof fetch): Promise<WeekDay[] | null> {
  const json = await readCountyJson(WEEK_URL, "一週預報", county, fetchImpl);
  return json === null ? null : parseCwaWeek(json, county);
}

/** 台灣的每小時 讀不到或沒有授權碼回 null */
export async function fetchCountyHours(county: County, fetchImpl?: typeof fetch): Promise<HourPoint[] | null> {
  const json = await readCountyJson(HOURS_URL, "每小時預報", county, fetchImpl);
  return json === null ? null : parseCwaHours(json, county);
}

export type WorldWeek = { days: WeekDay[]; hours: HourPoint[]; utcOffsetSeconds: number };

// 今天的細節跟一週預報同一個請求 不多用額度
const OPEN_METEO_DAILY =
  "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max,uv_index_max,sunrise,sunset";
const OPEN_METEO_HOURLY = "temperature_2m,precipitation_probability,weather_code,relative_humidity_2m,dew_point_2m,apparent_temperature,uv_index";

/** 國外的一週預報 Open-Meteo 不用金鑰 額度照 IP 算 伺服器與別的網站共用 要放快取 */
export async function fetchWorldWeek({ latitude, longitude, timezone }: Pick<WorldPlace, "latitude" | "longitude" | "timezone">, fetchImpl?: typeof fetch): Promise<WorldWeek | null> {
  const url = new URL(OPEN_METEO_URL);
  // 風速用每秒公尺 才對得上氣象署的風級表
  url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), daily: OPEN_METEO_DAILY, hourly: OPEN_METEO_HOURLY, wind_speed_unit: "ms", timezone, forecast_days: WEEK_DAYS }).toString();
  const json = await readJson(url, "國外的預報", fetchImpl);
  return json === null ? null : { days: parseOpenMeteoWeek(json), ...parseOpenMeteoHours(json) };
}

/** 有沒有設定授權碼 沒有時卡片說明要去哪裡申請 */
export function weatherKeys(): { forecast: boolean; airQuality: boolean } {
  const env = weatherEnv();
  return { forecast: Boolean(env.CWA_API_KEY), airQuality: Boolean(env.MOENV_API_KEY) };
}

/** 讀不到時 log 只記錯誤種類與狀態碼 網址帶著授權碼不能記 */
function readJson(url: URL, what: string, fetchImpl?: typeof fetch, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  return readExternalJson(url.toString(), { module: "weather", what: `讀不到${what}`, fetchImpl, timeoutMs });
}

/** county 是 null 時不帶 locationName 氣象署回全部的縣市 */
async function readCwaJson(endpoint: string, what: string, county: County | null, fetchImpl: typeof fetch | undefined, timeoutMs?: number): Promise<unknown> {
  const key = weatherEnv().CWA_API_KEY;
  if (!key) return null;
  const url = new URL(endpoint);
  url.searchParams.set("Authorization", key);
  if (county !== null) url.searchParams.set("locationName", county);
  url.searchParams.set("format", "JSON");
  return readJson(url, what, fetchImpl, timeoutMs);
}

/** 讀不到或沒有授權碼回 null 少了欄位時只記欄位名稱 */
export async function fetchForecast(county: County, fetchImpl?: typeof fetch): Promise<Forecast | null> {
  const json = await readCwaJson(FORECAST_URL, "天氣預報", county, fetchImpl);
  if (json === null) return null;
  const { forecast, missing } = parseForecast(json, county);
  logMissing("weather", "天氣預報", missing);
  return forecast;
}

/**
 * 全台一次讀 再挑出要的縣市 回應裡沒有的縣市不放進結果
 * 讀不到 沒有授權碼或一個縣市都解析不出來回 null
 */
export async function fetchForecasts(counties: readonly County[], fetchImpl?: typeof fetch): Promise<Map<County, Forecast> | null> {
  const json = await readCwaJson(FORECAST_URL, "天氣預報", null, fetchImpl, ALL_COUNTIES_TIMEOUT_MS);
  if (json === null) return null;
  const forecasts = new Map<County, Forecast>();
  const missing = new Set<string>();
  for (const county of counties) {
    const parsed = parseForecast(json, county);
    for (const name of parsed.missing) missing.add(name);
    if (parsed.forecast) forecasts.set(county, parsed.forecast);
  }
  // 只記欄位名稱 不記縣市 看不出誰住哪裡
  logMissing("weather", "天氣預報", missing);
  return forecasts.size > 0 ? forecasts : null;
}

/**
 * county 是 null 時全台一次讀 沒有特報的是空陣列
 * 少了欄位只記名稱 不記縣市 看不出誰住哪裡
 */
export async function fetchWarnings(county: County | null, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<Map<County, Warning[]> | null> {
  const json = await readCwaJson(WARNING_URL, "天氣警特報", county, fetchImpl, timeoutMs);
  if (json === null) return null;
  const { warnings, missing } = parseWarnings(json);
  logMissing("weather", "天氣警特報", missing);
  return warnings;
}

/** 全台的測站一次讀完 各縣市共用同一份 */
export async function fetchStations(fetchImpl?: typeof fetch): Promise<Station[] | null> {
  const key = weatherEnv().MOENV_API_KEY;
  if (!key) return null;
  const url = new URL(AQI_URL);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "1000");
  url.searchParams.set("format", "json");
  const json = await readJson(url, "空氣品質", fetchImpl);
  if (json === null) return null;
  const { stations, missing } = parseStations(json);
  logMissing("weather", "空氣品質", missing);
  return stations.length > 0 ? stations : null;
}
