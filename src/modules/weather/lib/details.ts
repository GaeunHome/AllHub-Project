import { levelPosition } from "./scale";

// 天氣頁的今天的細節 台灣與國外整理成同一種形狀 級數與等級照氣象署的表

/** level 是蒲福風級 */
export type Wind = { direction: string | null; level: number | null };

/** sunrise sunset 是當地時間的 HH:mm 氣象署的一週預報沒有 */
export type DayDetails = { feelsHigh: number | null; feelsLow: number | null; humidity: number | null; wind: Wind | null; uv: number | null; sunrise: string | null; sunset: string | null };

/** 氣象署蒲福風級表每一級的下限 單位是每秒公尺 */
const BEAUFORT_FLOORS = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 37, 41.5, 46.2, 51, 56.1];

export function beaufortLevel(speed: number): number {
  return BEAUFORT_FLOORS.filter((floor) => speed >= floor).length;
}

// 照氣象署的寫法 正東南西北前面加偏
const DIRECTIONS = ["偏北風", "東北風", "偏東風", "東南風", "偏南風", "西南風", "偏西風", "西北風"];

/** 角度是風吹來的方向 0 是北 順時針 */
export function windDirection(degrees: number): string {
  return DIRECTIONS[Math.round((((degrees % 360) + 360) % 360) / 45) % DIRECTIONS.length];
}

/** 箭頭指著風吹過去的方向 跟風從哪裡來差半圈 認不得的寫法是 null */
export function windToward(direction: string): number | null {
  const index = DIRECTIONS.indexOf(direction);
  return index === -1 ? null : (index * 45 + 180) % 360;
}

/** 方向與級數都讀不到時整格不畫 */
export const windOf = (direction: string | null, level: number | null): Wind | null => (direction === null && level === null ? null : { direction, level });

/** 氣象署的紫外線分級 上限含在那一級裡 */
const UV_LEVELS = [
  { max: 2, label: "低量級" },
  { max: 5, label: "中量級" },
  { max: 7, label: "高量級" },
  { max: 10, label: "過量級" },
  { max: Infinity, label: "危險級" },
] as const;

export function uvLevel(index: number): (typeof UV_LEVELS)[number]["label"] {
  return (UV_LEVELS.find((level) => index <= level.max) ?? UV_LEVELS[UV_LEVELS.length - 1]).label;
}

/** 危險級沒有上限 色條畫到 15 */
const UV_TOP = 15;

export const uvPosition = (index: number): number => levelPosition(index, UV_LEVELS.map((level) => level.max), UV_TOP);

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** 都是當地時間的 HH:mm 日出前在最左邊 日落後在最右邊 */
export function daylightPosition(sunrise: string, sunset: string, clock: string): number {
  const span = minutesOf(sunset) - minutesOf(sunrise);
  if (span <= 0) return 0;
  return Math.min(Math.max(((minutesOf(clock) - minutesOf(sunrise)) / span) * 100, 0), 100);
}
