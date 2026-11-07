import { asArray, asRecord, numberOf, text } from "@/core/json";
import { DAY_MS } from "@/core/time";
import type { County } from "./counties";
import { beaufortLevel, windDirection, windOf, type DayDetails } from "./details";

// 一週預報與今天的細節 台灣用氣象署 F-D0047-091 國外用 Open-Meteo 兩邊整理成同一種形狀
// 每小時 台灣用氣象署 F-D0047-089 只有三天 國外跟一週預報同一個回應
// 氣象署的格式照官方文件 還沒用真實授權碼驗證

export type WeekDay = { date: string; weather: string | null; high: number | null; low: number | null; rain: number | null; details: DayDetails };
/** time 是當地時間的 YYYY-MM-DDTHH:mm */
export type HourPoint = { time: string; temperature: number | null; rain: number | null; weather: string | null };
/** country 是兩個小寫字母的國家代碼 畫國旗用 */
export type WorldPlace = { name: string; country: string; latitude: number; longitude: number; timezone: string };

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

const average = (values: (number | null)[]) => {
  const numbers = values.filter((value) => value !== null);
  return numbers.length > 0 ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
};

/** 例如 2026-11-07T06:05 只留幾點幾分 已經是當地時間 */
const clockOf = (value: unknown) => text(value)?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;

/** Open-Meteo 的每日沒有濕度 用當天每小時的平均 */
function dailyHumidity(json: unknown): Map<string, number | null> {
  const hourly = asRecord(asRecord(json)?.hourly);
  const humidity = asArray(hourly?.relative_humidity_2m);
  const byDate = new Map<string, (number | null)[]>();
  asArray(hourly?.time).forEach((value, index) => {
    const date = text(value)?.slice(0, 10);
    if (!date) return;
    const values = byDate.get(date) ?? [];
    values.push(numberOf(humidity[index]));
    byDate.set(date, values);
  });
  return new Map([...byDate].map(([date, values]) => [date, average(values)]));
}

/** 風速要用 wind_speed_unit=ms 讀 級數照每秒公尺算 */
export function parseOpenMeteoWeek(json: unknown): WeekDay[] {
  const daily = asRecord(asRecord(json)?.daily);
  const humidity = dailyHumidity(json);
  return asArray(daily?.time).flatMap((value, index) => {
    const date = text(value);
    if (!date) return [];
    const at = (name: string) => asArray(daily?.[name])[index];
    const code = numberOf(at("weather_code"));
    const [degrees, speed] = [numberOf(at("wind_direction_10m_dominant")), numberOf(at("wind_speed_10m_max"))];
    const details: DayDetails = {
      feelsHigh: rounded(at("apparent_temperature_max")),
      feelsLow: rounded(at("apparent_temperature_min")),
      humidity: humidity.get(date) ?? null,
      wind: windOf(degrees === null ? null : windDirection(degrees), speed === null ? null : beaufortLevel(speed)),
      uv: rounded(at("uv_index_max")),
      sunrise: clockOf(at("sunrise")),
      sunset: clockOf(at("sunset")),
    };
    return [{ date, weather: code === null ? null : wmoText(code), high: rounded(at("temperature_2m_max")), low: rounded(at("temperature_2m_min")), rain: rounded(at("precipitation_probability_max")), details }];
  });
}

export function parseOpenMeteoHours(json: unknown): { hours: HourPoint[]; utcOffsetSeconds: number } {
  const hourly = asRecord(asRecord(json)?.hourly);
  const hours = asArray(hourly?.time).flatMap((value, index) => {
    const time = text(value);
    if (!time) return [];
    const code = numberOf(asArray(hourly?.weather_code)[index]);
    return [{ time, temperature: rounded(asArray(hourly?.temperature_2m)[index]), rain: rounded(asArray(hourly?.precipitation_probability)[index]), weather: code === null ? null : wmoText(code) }];
  });
  return { hours, utcOffsetSeconds: numberOf(asRecord(json)?.utc_offset_seconds) ?? 0 };
}

/** 有這幾個要素的日期才算一天 細節只是補充 */
const DAY_ELEMENTS = ["最高溫度", "最低溫度", "12小時降雨機率", "天氣現象"];

type CwaPeriod = { date: string; hour: number; values: Record<string, unknown> };

/** 時間是 2026-11-05T06:00:00+08:00 這種台灣時間 前十個字就是日期 值是 ElementValue 的第一筆 */
function periodsOf(element: unknown): CwaPeriod[] {
  return asArray(asRecord(element)?.Time).flatMap((period) => {
    const entry = asRecord(period);
    const start = text(entry?.StartTime);
    return start ? [{ date: start.slice(0, 10), hour: Number(start.slice(11, 13)), values: asRecord(asArray(entry?.ElementValue)[0]) ?? {} }] : [];
  });
}

const extreme = (values: (number | null)[], pick: (...numbers: number[]) => number) => {
  const numbers = values.filter((value) => value !== null);
  return numbers.length > 0 ? pick(...numbers) : null;
};

function cwaLocation(json: unknown, county: County): Record<string, unknown> | null {
  const locations = asArray(asRecord(asArray(asRecord(asRecord(json)?.records)?.Locations)[0])?.Location);
  return asRecord(locations.find((value) => text(asRecord(value)?.LocationName) === county));
}

/** 風級讀不到時照風速換算 */
function cwaWind(direction: Record<string, unknown> | undefined, speed: Record<string, unknown> | undefined) {
  const metres = numberOf(speed?.WindSpeed);
  return windOf(text(direction?.WindDirection), numberOf(speed?.BeaufortScale) ?? (metres === null ? null : beaufortLevel(metres)));
}

export function parseCwaWeek(json: unknown, county: County): WeekDay[] {
  const location = cwaLocation(json, county);
  if (!location) return [];
  const byName = (name: string) => periodsOf(asArray(location.WeatherElement).find((value) => text(asRecord(value)?.ElementName) === name));
  const dates = [...new Set(DAY_ELEMENTS.flatMap((name) => byName(name).map((period) => period.date)))].sort();
  return dates.map((date) => {
    const ofDay = (name: string) => byName(name).filter((period) => period.date === date);
    const numbers = (name: string, key: string) => ofDay(name).map((period) => numberOf(period.values[key]));
    // 天氣與風看白天那一段 晚上看時今天白天已經過了 用剩下的那一段
    const daytime = (name: string) => {
      const periods = ofDay(name);
      return (periods.find((period) => period.hour >= 6 && period.hour < 18) ?? periods[0])?.values;
    };
    const details: DayDetails = {
      feelsHigh: extreme(numbers("最高體感溫度", "MaxApparentTemperature"), Math.max),
      feelsLow: extreme(numbers("最低體感溫度", "MinApparentTemperature"), Math.min),
      humidity: average(numbers("平均相對濕度", "RelativeHumidity")),
      wind: cwaWind(daytime("風向"), daytime("風速")),
      // 只有白天的時段有紫外線
      uv: extreme(numbers("紫外線指數", "UVIndex"), Math.max),
      sunrise: null,
      sunset: null,
    };
    return {
      date,
      weather: text(daytime("天氣現象")?.Weather),
      high: extreme(numbers("最高溫度", "MaxTemperature"), Math.max),
      low: extreme(numbers("最低溫度", "MinTemperature"), Math.min),
      rain: extreme(numbers("12小時降雨機率", "ProbabilityOfPrecipitation"), Math.max),
      details,
    };
  });
}

/** 溫度是一個時間點 降雨機率與天氣是一段時間 找涵蓋那個時間點的 */
function coveringValue(element: unknown, key: string, time: string): unknown {
  const period = asArray(asRecord(element)?.Time).find((value) => {
    const entry = asRecord(value);
    const [start, end] = [text(entry?.StartTime), text(entry?.EndTime)];
    return start !== null && end !== null && time >= start && time < end;
  });
  return asRecord(asArray(asRecord(period)?.ElementValue)[0])?.[key];
}

export function parseCwaHours(json: unknown, county: County): HourPoint[] {
  const location = cwaLocation(json, county);
  if (!location) return [];
  const element = (name: string) => asArray(location.WeatherElement).find((value) => text(asRecord(value)?.ElementName) === name);
  const [rain, weather] = [element("3小時降雨機率"), element("天氣現象")];
  return asArray(asRecord(element("溫度"))?.Time).flatMap((point) => {
    const entry = asRecord(point);
    const time = text(entry?.DataTime);
    if (!time) return [];
    return [{ time: time.slice(0, 16), temperature: rounded(asRecord(asArray(entry?.ElementValue)[0])?.Temperature), rain: rounded(coveringValue(rain, "ProbabilityOfPrecipitation", time)), weather: text(coveringValue(weather, "Weather", time)) }];
  });
}

const localTime = (now: Date, utcOffsetSeconds: number) => new Date(now.getTime() + utcOffsetSeconds * 1000).toISOString();

/** 半夜讀到的第一段還是昨晚 快取裡也可能留著昨天 第一列才會是真的今天 */
export function fromToday(days: readonly WeekDay[], now: Date, utcOffsetSeconds: number): WeekDay[] {
  const today = localTime(now, utcOffsetSeconds).slice(0, 10);
  return days.filter(({ date }) => date >= today);
}

/** 已經過去的小時不列 現在這一小時還在 */
export function upcomingHours(hours: readonly HourPoint[], now: Date, utcOffsetSeconds: number): HourPoint[] {
  const local = localTime(now, utcOffsetSeconds).slice(0, 13);
  return hours.filter(({ time }) => time.slice(0, 13) >= local);
}

/** 從現在這一小時起 到 24 小時後的前一格 */
export function nextDayHours(hours: readonly HourPoint[], now: Date, utcOffsetSeconds: number): HourPoint[] {
  const until = localTime(new Date(now.getTime() + DAY_MS), utcOffsetSeconds).slice(0, 13);
  return upcomingHours(hours, now, utcOffsetSeconds).filter(({ time }) => time.slice(0, 13) < until);
}
