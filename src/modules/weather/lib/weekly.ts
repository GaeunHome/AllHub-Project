import { asArray, asRecord, numberOf, text } from "@/core/json";
import { COUNTIES, type County } from "./counties";

// 一週預報 台灣用氣象署 F-D0047-091 國外用 Open-Meteo 兩邊整理成同一種形狀
// 氣象署的格式照官方文件 還沒用真實授權碼驗證

export type WeekDay = { date: string; weather: string | null; high: number | null; low: number | null; rain: number | null };
/** country 是兩個小寫字母的國家代碼 畫國旗用 搜尋結果偶爾沒有 */
export type WorldPlace = { name: string; country: string | null; latitude: number; longitude: number; timezone: string };
export type PlaceChoice = { kind: "county"; name: County; country: null; latitude: null; longitude: null; timezone: null } | ({ kind: "world" } & WorldPlace);

const WMO_RANGES: [number, number, string][] = [
  [0, 0, "晴"],
  [1, 2, "多雲"],
  [3, 3, "陰"],
  [45, 48, "霧"],
  [51, 57, "毛毛雨"],
  [61, 67, "雨"],
  [71, 77, "雪"],
  [80, 82, "陣雨"],
  [85, 86, "陣雪"],
  [95, 99, "雷雨"],
];

/** Open-Meteo 用世界氣象組織的代碼 認不得的回 null 不亂猜 */
export function wmoText(code: number): string | null {
  return WMO_RANGES.find(([from, to]) => code >= from && code <= to)?.[2] ?? null;
}

const rounded = (value: unknown) => {
  const number = numberOf(value);
  return number === null ? null : Math.round(number);
};

export function parseOpenMeteoWeek(json: unknown): WeekDay[] {
  const daily = asRecord(asRecord(json)?.daily);
  const days = asArray(daily?.time);
  return days.flatMap((value, index) => {
    const date = text(value);
    if (!date) return [];
    const code = numberOf(asArray(daily?.weather_code)[index]);
    return [{ date, weather: code === null ? null : wmoText(code), high: rounded(asArray(daily?.temperature_2m_max)[index]), low: rounded(asArray(daily?.temperature_2m_min)[index]), rain: rounded(asArray(daily?.precipitation_probability_max)[index]) }];
  });
}

const ELEMENTS: Record<string, string> = { 最高溫度: "MaxTemperature", 最低溫度: "MinTemperature", "12小時降雨機率": "ProbabilityOfPrecipitation", 天氣現象: "Weather" };

/** 時間是 2026-11-05T06:00:00+08:00 這種台灣時間 前十個字就是日期 */
function periodsOf(element: unknown): { date: string; hour: number; value: unknown }[] {
  const row = asRecord(element);
  const key = ELEMENTS[text(row?.ElementName) ?? ""];
  if (!key) return [];
  return asArray(row?.Time).flatMap((period) => {
    const entry = asRecord(period);
    const start = text(entry?.StartTime);
    return start ? [{ date: start.slice(0, 10), hour: Number(start.slice(11, 13)), value: asRecord(asArray(entry?.ElementValue)[0])?.[key] }] : [];
  });
}

const extreme = (values: (number | null)[], pick: (...numbers: number[]) => number) => {
  const numbers = values.filter((value) => value !== null);
  return numbers.length > 0 ? pick(...numbers) : null;
};

export function parseCwaWeek(json: unknown, county: County): WeekDay[] {
  const locations = asArray(asRecord(asArray(asRecord(asRecord(json)?.records)?.Locations)[0])?.Location);
  const location = asRecord(locations.find((value) => text(asRecord(value)?.LocationName) === county));
  if (!location) return [];
  const byName = (name: string) => periodsOf(asArray(location.WeatherElement).find((value) => text(asRecord(value)?.ElementName) === name));
  const dates = [...new Set(Object.keys(ELEMENTS).flatMap((name) => byName(name).map((period) => period.date)))].sort();
  return dates.map((date) => {
    const ofDay = (name: string) => byName(name).filter((period) => period.date === date);
    const numbers = (name: string) => ofDay(name).map((period) => numberOf(period.value));
    const weathers = ofDay("天氣現象");
    const daytime = weathers.find((period) => period.hour >= 6 && period.hour < 18) ?? weathers[0];
    return { date, weather: text(daytime?.value), high: extreme(numbers("最高溫度"), Math.max), low: extreme(numbers("最低溫度"), Math.min), rain: extreme(numbers("12小時降雨機率"), Math.max) };
  });
}

export function parseCityResults(json: unknown): WorldPlace[] {
  return asArray(asRecord(json)?.results).flatMap((value) => {
    const row = asRecord(value);
    const name = text(row?.name);
    const latitude = numberOf(row?.latitude);
    const longitude = numberOf(row?.longitude);
    const timezone = text(row?.timezone);
    if (!name || latitude === null || longitude === null || !timezone) return [];
    const country = text(row?.country);
    return [{ name: country ? `${name}, ${country}` : name, country: text(row?.country_code)?.toLowerCase() ?? null, latitude, longitude, timezone }];
  });
}

const NAME_MAX = 40;
const TIMEZONE = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/;
// 代碼會組成圖片的路徑
const COUNTRY = /^[a-z]{2}$/;
const isCounty = (name: string): name is County => (COUNTIES as readonly string[]).includes(name);
export const isLatitude = (value: unknown): value is number => typeof value === "number" && value >= -90 && value <= 90;
export const isLongitude = (value: unknown): value is number => typeof value === "number" && value >= -180 && value <= 180;

/** 視窗的選項值是 JSON 表單可能被改過 一項一項檢查 */
export function parsePlaceChoice(raw: string): { ok: true; value: PlaceChoice } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "請選擇城市" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid;
  }
  const row = asRecord(parsed);
  const name = text(row?.name);
  if (!name || [...name].length > NAME_MAX) return invalid;
  if (row?.kind === "county") return isCounty(name) ? { ok: true, value: { kind: "county", name, country: null, latitude: null, longitude: null, timezone: null } } : invalid;
  const { latitude, longitude, timezone } = row ?? {};
  const country = text(row?.country);
  if (country !== null && !COUNTRY.test(country)) return invalid;
  if (row?.kind !== "world" || !isLatitude(latitude) || !isLongitude(longitude) || typeof timezone !== "string" || !TIMEZONE.test(timezone)) return invalid;
  return { ok: true, value: { kind: "world", name, country, latitude, longitude, timezone } };
}
