import { formatTaipeiLongDate } from "@/core/time";
import { cityPhoto } from "../lib/city-photos";
import type { HourPoint, WeekDay } from "../lib/weekly";
import { weatherArt, weatherScene, type WeatherArt, type WeatherScene } from "./weather-view";

// 天氣頁的一週 溫度條的位置是這一週最低到最高的比例 看得出哪天比較冷

export type WeekRow = WeekDay & { label: string; art: WeatherArt; left: number; right: number };

const weekday = (date: string) => formatTaipeiLongDate(new Date(`${date}T12:00:00+08:00`)).slice(-3);

export function weekRows(week: readonly WeekDay[]): WeekRow[] {
  const lows = week.flatMap(({ low }) => (low === null ? [] : [low]));
  const highs = week.flatMap(({ high }) => (high === null ? [] : [high]));
  const min = Math.min(...lows, ...highs);
  const max = Math.max(...lows, ...highs);
  const span = Math.max(max - min, 1);
  return week.map((day, index) => ({
    ...day,
    label: index === 0 ? "今天" : weekday(day.date),
    art: weatherArt(day.weather ?? "", false),
    left: day.low === null ? 0 : ((day.low - min) / span) * 100,
    right: day.high === null ? 0 : ((max - day.high) / span) * 100,
  }));
}

export type HourColumn = HourPoint & { clock: string; art: WeatherArt };

/** time 已經是當地時間 所以幾點直接從字串拿 不換時區 */
export function hourColumns(hours: readonly HourPoint[]): Record<string, HourColumn[]> {
  const columns: Record<string, HourColumn[]> = {};
  for (const hour of hours) {
    const clock = hour.time.slice(11, 16);
    const night = clock < "06:00" || clock >= "18:00";
    (columns[hour.time.slice(0, 10)] ??= []).push({ ...hour, clock, art: weatherArt(hour.weather ?? "", night) });
  }
  return columns;
}

/** 圖照今天的天氣 晚上的圖太暗 字疊上去不好讀 一律用白天的 */
const heroScene = (today: WeekDay | undefined): WeatherScene => weatherScene(today?.weather ?? "", false);

/** 內建地點用固定的照片 清單以外的舊城市沒有照片 退回場景圖 */
export const heroImage = (name: string, today: WeekDay | undefined): string => cityPhoto(name)?.src ?? heroScene(today);

export function todayText(today: WeekDay): string {
  const parts = [today.weather, today.rain === null ? null : `降雨機率 ${today.rain}%`, today.high === null ? null : `最高 ${today.high}°`, today.low === null ? null : `最低 ${today.low}°`];
  return parts.filter(Boolean).join("，");
}
