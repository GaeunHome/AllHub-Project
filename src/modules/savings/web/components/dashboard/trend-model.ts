import type { TrendPoint } from "../../../lib/ledger";
import type { MonthKey } from "../../../lib/month";
import { areaPath, columnCenters, linePath, niceScale, scalePercent, type ChartPoint, type NiceScale } from "../../chart-geometry";

// 收支是長條 資產是折線 兩張圖各自一個刻度 不共用雙 y 軸

export type TrendMode = "flow" | "assets";

/**
 * 不寫月數 剛開始用時不到 12 個月
 * 放在這裡伺服器元件的空狀態也拿得到同一個字串
 */
export const TREND_TITLE = "每月趨勢";

export type FlowColumn = { month: MonthKey; income: number; expense: number; incomeHeight: number; expenseHeight: number };

export function flowChart(points: TrendPoint[]): { scale: NiceScale; columns: FlowColumn[]; empty: boolean } {
  const peak = Math.max(0, ...points.flatMap((p) => [p.income, p.expense]));
  const scale = niceScale(0, peak);
  return {
    scale,
    columns: points.map(({ month, income, expense }) => ({ month, income, expense, incomeHeight: scalePercent(income, scale), expenseHeight: scalePercent(expense, scale) })),
    empty: peak === 0,
  };
}

/** 面積收在 0 的高度 資產有負的月份時才不會往下多塗一塊 */
export function assetChart(points: TrendPoint[]): { scale: NiceScale; points: ChartPoint[]; line: string; area: string; baseline: number } {
  const values = points.map((p) => p.assets);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const xs = columnCenters(points.length);
  const chartPoints = values.map((value, i) => ({ x: xs[i], y: scalePercent(value, scale) }));
  const baseline = scalePercent(0, scale);
  return { scale, points: chartPoints, line: linePath(chartPoints), area: areaPath(chartPoints, baseline), baseline };
}

/** 滑過優先 其次是鍵盤 再來是選到的月份 都沒有就是最新的 */
export function readoutIndex(points: TrendPoint[], { hover, focus }: { hover: number | null; focus: number | null }, selected: MonthKey): number {
  // 月份變少時舊的滑過或焦點位置可能已經不在 當作沒有 不讓卡片出錯
  const inRange = (index: number | null): index is number => index !== null && index >= 0 && index < points.length;
  const selectedIndex = points.findIndex((p) => p.month === selected);
  const index = [hover, focus, selectedIndex].find(inRange) ?? points.length - 1;
  return Math.max(0, index);
}

const UNITS = [
  { size: 100_000_000, label: "億" },
  { size: 10_000, label: "萬" },
] as const;

const plainNumber = new Intl.NumberFormat("zh-TW");

/**
 * 同一軸只用一種寫法 刻度都是單位十分之一的倍數才用萬或億 不會出現 0.25 萬
 * 金額的符號寫在讀數與表格裡
 */
export function axisLabels(ticks: number[]): string[] {
  const top = Math.max(0, ...ticks.map((tick) => Math.abs(tick)));
  const unit = UNITS.find(({ size }) => top >= size && ticks.every((tick) => tick % (size / 10) === 0));
  return ticks.map((tick) => {
    if (tick === 0) return "0";
    return unit ? `${tick / unit.size} ${unit.label}` : plainNumber.format(tick);
  });
}
