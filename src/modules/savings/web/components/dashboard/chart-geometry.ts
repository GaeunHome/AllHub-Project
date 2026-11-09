// 純函式 伺服器與瀏覽器算出一樣的標記 hydration 才不會對不上

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  // 加 0 把 -0 變成 0 標記上才不會出現 -0
  return Math.round(value * factor) / factor + 0;
};

export type NiceScale = { min: number; max: number; ticks: number[] };

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** 一定包含 0 長條從 0 長出來才不會誇大差距 金額是整數 刻度至少差 1 元 */
export function niceScale(min: number, max: number, count = 4): NiceScale {
  const low = Math.min(0, min);
  const high = Math.max(0, max);
  if (high === low) return { min: 0, max: 1, ticks: [0] };

  const raw = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = NICE_STEPS.map((nice) => nice * magnitude).find((candidate) => candidate >= raw && Number.isInteger(candidate)) ?? Math.max(1, Math.ceil(raw));
  const scaleMin = Math.floor(low / step) * step;
  const scaleMax = Math.ceil(high / step) * step;
  const ticks = Array.from({ length: Math.round((scaleMax - scaleMin) / step) + 1 }, (_, i) => scaleMin + i * step);
  return { min: scaleMin + 0, max: scaleMax, ticks: ticks.map((tick) => tick + 0) };
}

/** 從底部算起的高度百分比 */
export function scalePercent(value: number, scale: Pick<NiceScale, "min" | "max">): number {
  return round(((value - scale.min) / (scale.max - scale.min)) * 100, 2);
}
