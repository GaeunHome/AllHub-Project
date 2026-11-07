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
