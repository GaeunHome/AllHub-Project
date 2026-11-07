import type { StatusBadge } from "@/core/ui/status-chip";
import { aqiWarns, countyAqi, type Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import { isNight, periodLabel, upcomingPeriods, type Forecast, type ForecastPeriod } from "../lib/forecast";
import { rainOutlook, type RainLevel } from "../lib/rain";
import { activeWarnings, warningEndText, type Warning } from "../lib/warnings";

// 伺服器把預報整理成要顯示的文字 卡片只負責排版

/** 照氣象署的天氣描述挑圖示 晚上的晴天與多雲換成月亮 */
/** public/images/weather 的檔名 使用者要的：不用線條圖示 圖是靜態檔不佔資料庫 */
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

export type PeriodView = { label: string; description: string; temperature: string | null; rain: number | null; comfort: string | null };

/** 卡片上要不要帶傘 detail 是降雨機率最高的那一段 */
export type Reminder = { level: RainLevel; title: string; detail: string };

const REMINDER_TITLES = { umbrella: "記得帶傘", maybe: "帶把折傘", dry: "不用帶傘" } as const satisfies Record<RainLevel, string>;

/** 卡片最上面的一個標籤 */
export type WarningChip = Pick<StatusBadge, "label" | "tone">;

/** 測站的發布時間只取時分 例如 2026/10/16 15:00:00 寫成 15:00 */
const publishedHour = (value: string | null) => value?.match(/(\d{1,2}):(\d{2})/)?.[0] ?? null;

export type WeatherView = {
  county: County;
  scene: WeatherScene;
  /** 讀不到預報時是 null */
  now: PeriodView | null;
  next: PeriodView | null;
  /** 看現在這一段與下一段 讀不到預報或兩段的降雨機率都讀不到時是 null */
  reminder: Reminder | null;
  /** 沒有特報或讀不到時是空的 */
  warnings: WarningChip[];
  /** 沒設環境部的授權碼時是 undefined 讀不到是 null */
  air?: { level: string; aqi: number; site: string; time: string | null; warn: boolean } | null;
};

function periodView(period: ForecastPeriod, now: Date): PeriodView {
  const start = new Date(period.start);
  return { label: periodLabel(start, now), description: period.description, temperature: temperatureText(period), rain: period.rain, comfort: period.comfort };
}

function reminderOf(periods: readonly ForecastPeriod[], now: Date): Reminder | null {
  const outlook = rainOutlook(periods);
  if (outlook === null) return null;
  const { level, peak } = outlook;
  return { level, title: REMINDER_TITLES[level], detail: `${periodLabel(new Date(peak.start), now)}降雨機率 ${peak.rain}%` };
}

/** 警報用最強的顏色 特報用警示色 */
function warningChip({ label, severe, end }: Warning, now: Date): WarningChip {
  return { label: end === null ? label : `${label} 到 ${warningEndText(end, now)}`, tone: severe ? "danger" : "warning" };
}

/** 結束時間已過的不算 首頁卡片與天氣頁共用 */
export const warningChips = (warnings: readonly Warning[], now: Date): WarningChip[] => activeWarnings(warnings, now).map((warning) => warningChip(warning, now));

export type AirView = NonNullable<WeatherView["air"]>;

/** 照縣市裡最差的測站 這個縣市沒有測站時是 null */
export function airView(stations: readonly Station[], county: County): AirView | null {
  const air = countyAqi(stations, county);
  return air && { level: air.level, aqi: air.aqi, site: air.site, time: publishedHour(air.publishedAt), warn: aqiWarns(air.aqi) };
}

export function weatherView(county: County, forecast: Forecast | null, stations: readonly Station[] | null | undefined, now: Date, warnings: readonly Warning[] | null = null): WeatherView {
  // 提醒跟卡片看同樣的兩段 早上的通知也是這兩段
  const shown = forecast ? upcomingPeriods(forecast, now).slice(0, 2) : [];
  const [current, next] = shown;
  const air = stations === undefined ? undefined : stations === null ? null : airView(stations, county);
  return {
    county,
    scene: current ? weatherScene(current.description, isNight(new Date(current.start))) : "/images/scenes/weather-cloudy-day.svg",
    now: current ? periodView(current, now) : null,
    next: next ? periodView(next, now) : null,
    reminder: reminderOf(shown, now),
    warnings: warningChips(warnings ?? [], now),
    ...(air === undefined ? {} : { air }),
  };
}
