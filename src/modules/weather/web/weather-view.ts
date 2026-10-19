import type { UiIconName } from "@/core/ui/icon";
import { aqiWarns, countyAqi, type Station } from "../lib/aqi";
import type { County } from "../lib/counties";
import { isNight, periodLabel, upcomingPeriods, type Forecast, type ForecastPeriod } from "../lib/forecast";
import { rainOutlook, type RainLevel } from "../lib/rain";

// 伺服器把預報整理成要顯示的文字 卡片只負責排版

/** 照氣象署的天氣描述挑圖示 晚上的晴天與多雲換成月亮 */
export function weatherIcon(description: string, night: boolean): UiIconName {
  if (description.includes("雷")) return "cloud-lightning";
  if (description.includes("雪")) return "snowflake";
  if (description.includes("雨")) return "cloud-rain";
  if (description.includes("霧")) return "cloud-fog";
  if (description.includes("陰")) return "cloud";
  if (description.includes("多雲")) return night ? "cloud-moon" : "cloud-sun";
  if (description.includes("晴")) return night ? "moon-star" : "sun";
  return "cloud";
}

export function temperatureText(period: Pick<ForecastPeriod, "minTemp" | "maxTemp">): string | null {
  const { minTemp, maxTemp } = period;
  if (minTemp === null && maxTemp === null) return null;
  if (minTemp === null || maxTemp === null || minTemp === maxTemp) return `${minTemp ?? maxTemp}°`;
  return `${minTemp}–${maxTemp}°`;
}

export type PeriodView = { label: string; description: string; icon: UiIconName; temperature: string | null; rain: number | null; comfort: string | null };

/** 卡片上要不要帶傘 detail 是降雨機率最高的那一段 */
export type Reminder = { level: RainLevel; title: string; detail: string };

const REMINDER_TITLES = { umbrella: "記得帶傘", maybe: "帶把折傘", dry: "不用帶傘" } as const satisfies Record<RainLevel, string>;

/** 測站的發布時間只取時分 例如 2026/10/16 15:00:00 寫成 15:00 */
const publishedHour = (value: string | null) => value?.match(/(\d{1,2}):(\d{2})/)?.[0] ?? null;

export type WeatherView = {
  county: County;
  /** 讀不到預報時是 null */
  now: PeriodView | null;
  next: PeriodView | null;
  /** 看現在這一段與下一段 讀不到預報或兩段的降雨機率都讀不到時是 null */
  reminder: Reminder | null;
  /** 沒設環境部的授權碼時是 undefined 讀不到是 null */
  air?: { level: string; aqi: number; site: string; time: string | null; warn: boolean } | null;
};

function periodView(period: ForecastPeriod, now: Date): PeriodView {
  const start = new Date(period.start);
  return { label: periodLabel(start, now), description: period.description, icon: weatherIcon(period.description, isNight(start)), temperature: temperatureText(period), rain: period.rain, comfort: period.comfort };
}

function reminderOf(periods: readonly ForecastPeriod[], now: Date): Reminder | null {
  const outlook = rainOutlook(periods);
  if (outlook === null) return null;
  const { level, peak } = outlook;
  return { level, title: REMINDER_TITLES[level], detail: `${periodLabel(new Date(peak.start), now)}降雨機率 ${peak.rain}%` };
}

export function weatherView(county: County, forecast: Forecast | null, stations: readonly Station[] | null | undefined, now: Date): WeatherView {
  // 提醒跟卡片看同樣的兩段 早上的通知也是這兩段
  const shown = forecast ? upcomingPeriods(forecast, now).slice(0, 2) : [];
  const [current, next] = shown;
  const air = stations === undefined ? undefined : stations === null ? null : countyAqi(stations, county);
  return {
    county,
    now: current ? periodView(current, now) : null,
    next: next ? periodView(next, now) : null,
    reminder: reminderOf(shown, now),
    ...(air === undefined ? {} : { air: air && { level: air.level, aqi: air.aqi, site: air.site, time: publishedHour(air.publishedAt), warn: aqiWarns(air.aqi) } }),
  };
}
