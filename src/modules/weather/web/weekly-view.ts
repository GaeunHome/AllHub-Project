import { formatTaipeiLongDate } from "@/core/time";
import { cityPhoto } from "../lib/city-photos";
import { daylightPosition, uvLevel, uvPosition, windToward, type DayDetails } from "../lib/details";
import type { HourPoint, WeekDay } from "../lib/weekly";
import { temperatureText, weatherArt, weatherScene, type WeatherArt, type WeatherScene } from "./weather-view";

// 天氣頁要畫的一週 每小時 今天的細節與大圖

export type WeekRow = WeekDay & { label: string; art: WeatherArt; left: number; right: number };

const weekday = (date: string) => formatTaipeiLongDate(new Date(`${date}T12:00:00+08:00`)).slice(-3);

/** 溫度條的位置是這一週最低到最高的比例 看得出哪天比較冷 */
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
export function hourColumn(hour: HourPoint): HourColumn {
  const clock = hour.time.slice(11, 16);
  const night = clock < "06:00" || clock >= "18:00";
  return { ...hour, clock, art: weatherArt(hour.weather ?? "", night) };
}

export function hourColumns(hours: readonly HourPoint[]): Record<string, HourColumn[]> {
  const columns: Record<string, HourColumn[]> = {};
  for (const hour of hours) (columns[hour.time.slice(0, 10)] ??= []).push(hourColumn(hour));
  return columns;
}

/** 每一格標題旁的 3D 小圖 檔案在 public/images/weather */
export type DetailArt = "thermometer" | "droplet" | "wind" | "sunglasses" | "sunrise" | "sunset";

/** 使用者選的小量表 at 是 0 到 100 的位置 degrees 是風吹過去的方向 */
export type DetailMeter = { kind: "fill"; at: number } | { kind: "uv"; at: number } | { kind: "daylight"; at: number } | { kind: "toward"; degrees: number };

/** sub 是值下面的一行 例如風的級數 紫外線的等級 */
export type DetailTile = { label: string; value: string; sub: string | null; art: DetailArt; meter: DetailMeter | null };

const tile = (label: string, value: string, art: DetailArt, sub: string | null = null, meter: DetailMeter | null = null): DetailTile => ({ label, value, sub, art, meter });

/** 日出日落都有時併成一格 量表是太陽走到哪 */
function sunTile(sunrise: string | null, sunset: string | null, clock: string): DetailTile | null {
  if (sunrise !== null && sunset !== null) return tile("日出", sunrise, "sunrise", `日落 ${sunset}`, { kind: "daylight", at: daylightPosition(sunrise, sunset, clock) });
  if (sunrise !== null) return tile("日出", sunrise, "sunrise");
  return sunset === null ? null : tile("日落", sunset, "sunset");
}

/** 讀不到的那一格不畫 全部讀不到時是空的 整區不出現 clock 是當地現在的 HH:mm */
export function detailTiles({ feelsHigh, feelsLow, humidity, wind, uv, sunrise, sunset }: DayDetails, clock: string): DetailTile[] {
  const feels = temperatureText({ minTemp: feelsLow, maxTemp: feelsHigh });
  const level = wind && wind.level !== null ? `${wind.level} 級` : null;
  const toward = wind?.direction ? windToward(wind.direction) : null;
  const tiles: (DetailTile | null)[] = [
    feels === null ? null : tile("體感溫度", feels, "thermometer"),
    humidity === null ? null : tile("濕度", `${humidity}%`, "droplet", null, { kind: "fill", at: Math.min(Math.max(humidity, 0), 100) }),
    wind && tile("風", wind.direction ?? level ?? "", "wind", wind.direction === null ? null : level, toward === null ? null : { kind: "toward", degrees: toward }),
    uv === null ? null : tile("紫外線", String(uv), "sunglasses", uvLevel(uv), { kind: "uv", at: uvPosition(uv) }),
    sunTile(sunrise, sunset, clock),
  ];
  return tiles.filter((tile) => tile !== null);
}

/** 圖照今天的天氣 晚上的圖太暗 字疊上去不好讀 一律用白天的 */
const heroScene = (today: WeekDay | undefined): WeatherScene => weatherScene(today?.weather ?? "", false);

/** 內建地點用固定的照片 清單以外的舊城市沒有照片 退回場景圖 */
export const heroImage = (name: string, today: WeekDay | undefined): string => cityPhoto(name)?.src ?? heroScene(today);

export function todayText(today: WeekDay): string {
  const parts = [today.weather, today.rain === null ? null : `降雨機率 ${today.rain}%`, today.high === null ? null : `最高 ${today.high}°`, today.low === null ? null : `最低 ${today.low}°`];
  return parts.filter(Boolean).join("，");
}
