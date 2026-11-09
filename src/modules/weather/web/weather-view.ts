import { aqiLevel, aqiPosition, aqiWarns, countyAqi, countyStations, type Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import { isNight, periodLabel, upcomingPeriods, type Forecast, type ForecastPeriod } from "../lib/forecast";
import { rainOutlook, type RainLevel } from "../lib/rain";
import { activeWarnings, warningEndText, type Warning } from "../lib/warnings";

// 伺服器把預報整理成要顯示的文字 卡片只負責排版

/** 照天氣描述挑圖 晚上的晴天與多雲換成月亮 */
/** 使用者要的 不用線條圖示 檔名對 public/images/weather */
export type WeatherArt = "sun" | "sun-small-cloud" | "sun-cloud" | "sun-large-cloud" | "sun-rain" | "cloud" | "rain" | "storm" | "snow" | "fog" | "moon";

export function weatherArt(description: string, night: boolean): WeatherArt {
  if (description.includes("雷")) return "storm";
  if (description.includes("雪")) return "snow";
  if (description.includes("雨")) return !night && description.includes("晴") ? "sun-rain" : "rain";
  if (description.includes("霧")) return "fog";
  if (description.includes("陰")) return "cloud";
  if (description.includes("多雲")) {
    if (night) return "cloud";
    if (description.startsWith("晴")) return "sun-small-cloud";
    return description.includes("晴") ? "sun-cloud" : "sun-large-cloud";
  }
  if (description.includes("晴")) return night ? "moon" : "sun";
  return "cloud";
}

export type WeatherScene = `/images/scenes/weather-${"clear" | "cloudy" | "rain" | "storm"}-${"day" | "night"}.svg`;

/** 卡片的背景圖 照現在這一段的天氣與時段 霧與雪沒有自己的圖 看起來最接近的是陰天 */
export function weatherScene(description: string, night: boolean): WeatherScene {
  const time = night ? "night" : "day";
  if (description.includes("雷")) return `/images/scenes/weather-storm-${time}.svg`;
  if (description.includes("雨")) return `/images/scenes/weather-rain-${time}.svg`;
  if (description.startsWith("晴")) return `/images/scenes/weather-clear-${time}.svg`;
  return `/images/scenes/weather-cloudy-${time}.svg`;
}

export function temperatureText(period: Pick<ForecastPeriod, "minTemp" | "maxTemp">): string | null {
  const { minTemp, maxTemp } = period;
  if (minTemp === null && maxTemp === null) return null;
  if (minTemp === null || maxTemp === null || minTemp === maxTemp) return `${minTemp ?? maxTemp}°`;
  return `${minTemp}–${maxTemp}°`;
}

/** art 是那一段的天氣圖 晚上開始的時段換成月亮那一類 */
export type PeriodView = { label: string; description: string; temperature: string | null; rain: number | null; comfort: string | null; art: WeatherArt };

/** 卡片上要不要帶傘 detail 是降雨機率最高的那一段 */
export type Reminder = { level: RainLevel; title: string; detail: string };

const REMINDER_TITLES = { umbrella: "記得帶傘", maybe: "帶把折傘", dry: "不用帶傘" } as const satisfies Record<RainLevel, string>;

/** 測站的發布時間只取時分 例如 2026/10/16 15:00:00 寫成 15:00 */
const publishedHour = (value: string | null) => value?.match(/(\d{1,2}):(\d{2})/)?.[0] ?? null;

export type WeatherView = {
  county: County;
  scene: WeatherScene;
  /** 讀不到預報時是 null */
  now: PeriodView | null;
  next: PeriodView | null;
  /** 再下一段 使用者要填滿卡片 下面一排多寫一格 */
  later: PeriodView | null;
  /** 看現在這一段與下一段 讀不到預報或兩段的降雨機率都讀不到時是 null */
  reminder: Reminder | null;
  /** 沒有特報或讀不到時是空的 */
  warnings: WarningRow[];
  /** 沒設環境部的授權碼時是 undefined 讀不到是 null */
  air?: { level: string; aqi: number; site: string; time: string | null; warn: boolean } | null;
};

function periodView(period: ForecastPeriod, now: Date): PeriodView {
  const start = new Date(period.start);
  return { label: periodLabel(start, now), description: period.description, temperature: temperatureText(period), rain: period.rain, comfort: period.comfort, art: weatherArt(period.description, isNight(start)) };
}

function reminderOf(periods: readonly ForecastPeriod[], now: Date): Reminder | null {
  const outlook = rainOutlook(periods);
  if (outlook === null) return null;
  const { level, peak } = outlook;
  return { level, title: REMINDER_TITLES[level], detail: `${periodLabel(new Date(peak.start), now)}降雨機率 ${peak.rain}%` };
}

/** 使用者不要小標籤 一則一列 結束時間已過的不算 首頁卡片與天氣頁共用 */
export type WarningRow = { label: string; severe: boolean; until: string | null };

export const warningRows = (warnings: readonly Warning[], now: Date): WarningRow[] =>
  activeWarnings(warnings, now).map(({ label, severe, end }) => ({ label, severe, until: end === null ? null : `到 ${warningEndText(end, now)}` }));

/** 天氣頁的測站清單 at 是色條上的位置 */
export type StationRow = { site: string; aqi: number; level: string; at: number };

/** 數字與污染物照縣市最差的測站 首頁卡片只用前面幾個 */
export type AirView = NonNullable<WeatherView["air"]> & { pm25: number | null; pm10: number | null; o3: number | null; pollutant: string | null; stations: StationRow[] };

const roundedOrNull = (value: number | null) => (value === null ? null : Math.round(value));

/** 照縣市裡最差的測站 這個縣市沒有測站時是 null */
export function airView(stations: readonly Station[], county: County): AirView | null {
  const air = countyAqi(stations, county);
  if (!air) return null;
  return {
    level: air.level,
    aqi: air.aqi,
    site: air.site,
    time: publishedHour(air.publishedAt),
    warn: aqiWarns(air.aqi),
    pm25: roundedOrNull(air.pm25),
    pm10: roundedOrNull(air.pm10),
    o3: roundedOrNull(air.o3),
    pollutant: air.pollutant,
    stations: countyStations(stations, county).map(({ site, aqi }) => ({ site, aqi, level: aqiLevel(aqi), at: aqiPosition(aqi) })),
  };
}

export function weatherView(county: County, forecast: Forecast | null, stations: readonly Station[] | null | undefined, now: Date, warnings: readonly Warning[] | null = null): WeatherView {
  // 提醒跟卡片看同樣的兩段 早上的通知也是這兩段
  const upcoming = forecast ? upcomingPeriods(forecast, now) : [];
  const shown = upcoming.slice(0, 2);
  const [current, next, later] = upcoming;
  const air = stations === undefined ? undefined : stations === null ? null : airView(stations, county);
  return {
    county,
    scene: current ? weatherScene(current.description, isNight(new Date(current.start))) : "/images/scenes/weather-cloudy-day.svg",
    now: current ? periodView(current, now) : null,
    next: next ? periodView(next, now) : null,
    later: later ? periodView(later, now) : null,
    reminder: reminderOf(shown, now),
    warnings: warningRows(warnings ?? [], now),
    ...(air === undefined ? {} : { air }),
  };
}
