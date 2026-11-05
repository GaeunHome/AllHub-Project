import { formatTaipeiLongDate } from "@/core/time";
import type { WeekDay } from "../lib/weekly";
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

/** 圖照今天的天氣 晚上的圖太暗 字疊上去不好讀 一律用白天的 */
export const heroScene = (today: WeekDay | undefined): WeatherScene => weatherScene(today?.weather ?? "", false);

export function todayText(today: WeekDay): string {
  const parts = [today.weather, today.rain === null ? null : `降雨機率 ${today.rain}%`, today.high === null ? null : `最高 ${today.high}°`, today.low === null ? null : `最低 ${today.low}°`];
  return parts.filter(Boolean).join("，");
}
