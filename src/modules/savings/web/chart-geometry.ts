// 純函式 伺服器與瀏覽器算出一樣的標記 hydration 才不會對不上

/**
 * 圓周當成 100 stroke-dasharray 與 stroke-dashoffset 就是百分比
 * 不必知道實際畫出來多大
 */
export const DONUT_CIRCUMFERENCE = 100;
export const DONUT_RADIUS = DONUT_CIRCUMFERENCE / (2 * Math.PI);

/** 都是圓周的百分比 mid 是這片的中間 滑過時往那個方向外移 */
export type DonutSegment = { start: number; length: number; mid: number };

/** 標記上的數字都用它四捨五入 SVG 的屬性與樣式也是 */
export const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  // 加 0 把 -0 變成 0 標記上才不會出現 -0
  return Math.round(value * factor) / factor + 0;
};
const round = roundTo;

/**
 * 太小的片補到 minLength 補的長度從其他片多出來的部分按比例扣
 * 片與片才不會疊在一起
 */
function arcLengths(shares: number[], gap: number, minLength: number): { lengths: number[]; gap: number } {
  const drawn = shares.filter((share) => share > 0).length;
  const room = DONUT_CIRCUMFERENCE - drawn * gap;
  // 片太多連最小長度都放不下 就每片平均分 空隙也跟著縮小
  if (room < drawn * minLength) {
    const slot = DONUT_CIRCUMFERENCE / drawn;
    const narrowGap = Math.min(gap, slot / 2);
    return { lengths: shares.map((share) => (share > 0 ? slot - narrowGap : 0)), gap: narrowGap };
  }

  const wanted = shares.map((share) => (share > 0 ? share - gap : 0));
  const need = wanted.reduce((total, length, i) => total + (shares[i] > 0 && length < minLength ? minLength - length : 0), 0);
  const spare = wanted.reduce((total, length, i) => total + (shares[i] > 0 && length >= minLength ? length - minLength : 0), 0);
  return {
    lengths: wanted.map((length, i) => {
      if (shares[i] === 0) return 0;
      if (length < minLength) return minLength;
      return spare === 0 ? length : length - (need * (length - minLength)) / spare;
    }),
    gap,
  };
}

/**
 * 兩片以上時每片讓出 gap 當縫 露出底色 不另外描邊
 * 太小的片至少留 minLength 才不會被空隙吃掉
 */
export function donutSegments(amounts: number[], { gap = 0.8, minLength = 0.4 }: { gap?: number; minLength?: number } = {}): DonutSegment[] {
  const positives = amounts.map((amount) => Math.max(0, amount));
  const total = positives.reduce((sum, amount) => sum + amount, 0);
  if (total === 0) return amounts.map(() => ({ start: 0, length: 0, mid: 0 }));

  const shares = positives.map((amount) => (amount / total) * DONUT_CIRCUMFERENCE);
  // 只有一片就畫成完整的圓 不留空隙
  const split = shares.filter((share) => share > 0).length > 1;
  const arcs = split ? arcLengths(shares, gap, minLength) : { lengths: shares, gap: 0 };
  let cursor = 0;
  return arcs.lengths.map((length) => {
    if (length === 0) return { start: round(cursor, 3), length: 0, mid: round(cursor, 3) };
    const start = cursor + arcs.gap / 2;
    cursor += length + arcs.gap;
    return { start: round(start, 3), length: round(length, 3), mid: round(start + length / 2, 3) };
  });
}

/** 角度從 3 點鐘順時針算 外層的 g 轉 -90 度後畫面上從 12 點鐘開始 */
export function liftOffset(mid: number, distance: number): { x: number; y: number } {
  const angle = (mid / DONUT_CIRCUMFERENCE) * 2 * Math.PI;
  return { x: round(Math.cos(angle) * distance, 4), y: round(Math.sin(angle) * distance, 4) };
}

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

/** 點放在每個月那一欄的正中間 才跟 HTML 的格線欄位對齊 */
export function columnCenters(count: number): number[] {
  return Array.from({ length: count }, (_, i) => round(((i + 0.5) / count) * 100, 2));
}

/** 都是 0 到 100 的百分比 y 從底部算起 SVG 的 y 從上往下 畫時再換 */
export type ChartPoint = { x: number; y: number };

const coordinate = ({ x, y }: ChartPoint) => `${round(x, 2)} ${round(100 - y, 2)}`;

export function linePath(points: ChartPoint[]): string {
  if (points.length < 2) return "";
  return points.map((point, i) => `${i === 0 ? "M" : "L"}${coordinate(point)}`).join("");
}

/** 沿著折線走再回到 0 的高度收起來 */
export function areaPath(points: ChartPoint[], baseline: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `M${coordinate({ x: first.x, y: baseline })}${points.map((point) => `L${coordinate(point)}`).join("")}L${coordinate({ x: last.x, y: baseline })}Z`;
}
