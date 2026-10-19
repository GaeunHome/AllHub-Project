import "server-only";
import { weatherEnv } from "@/core/env";
import { readExternalJson } from "@/core/external-url";
import { parseStations, type Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import { parseForecast, type Forecast } from "../lib/forecast";

// 授權碼只在伺服器用 不進快取的 key 也不進回傳值

const FORECAST_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001";
const AQI_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432";
// 首頁在等 等不到就先顯示讀不到
const TIMEOUT_MS = 8_000;
// 早上的排程沒有人在等 全台的回應也比較大 多等一點
const ALL_COUNTIES_TIMEOUT_MS = 15_000;

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
async function readForecastJson(county: County | null, fetchImpl: typeof fetch | undefined, timeoutMs?: number): Promise<unknown> {
  const key = weatherEnv().CWA_API_KEY;
  if (!key) return null;
  const url = new URL(FORECAST_URL);
  url.searchParams.set("Authorization", key);
  if (county !== null) url.searchParams.set("locationName", county);
  url.searchParams.set("format", "JSON");
  return readJson(url, "天氣預報", fetchImpl, timeoutMs);
}

/** 讀不到或沒有授權碼回 null 少了欄位時只記欄位名稱 */
export async function fetchForecast(county: County, fetchImpl?: typeof fetch): Promise<Forecast | null> {
  const json = await readForecastJson(county, fetchImpl);
  if (json === null) return null;
  const { forecast, missing } = parseForecast(json, county);
  if (missing.length > 0) console.warn("[weather] 天氣預報少了欄位", missing.join(", "));
  return forecast;
}

/**
 * 全台一次讀 再挑出要的縣市 回應裡沒有的縣市不放進結果
 * 讀不到 沒有授權碼或一個縣市都解析不出來回 null
 */
export async function fetchForecasts(counties: readonly County[], fetchImpl?: typeof fetch): Promise<Map<County, Forecast> | null> {
  const json = await readForecastJson(null, fetchImpl, ALL_COUNTIES_TIMEOUT_MS);
  if (json === null) return null;
  const forecasts = new Map<County, Forecast>();
  const missing = new Set<string>();
  for (const county of counties) {
    const parsed = parseForecast(json, county);
    for (const name of parsed.missing) missing.add(name);
    if (parsed.forecast) forecasts.set(county, parsed.forecast);
  }
  // 只記欄位名稱 不記縣市 看不出誰住哪裡
  if (missing.size > 0) console.warn("[weather] 天氣預報少了欄位", [...missing].join(", "));
  return forecasts.size > 0 ? forecasts : null;
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
  if (missing.length > 0) console.warn("[weather] 空氣品質少了欄位", missing.join(", "));
  return stations.length > 0 ? stations : null;
}
