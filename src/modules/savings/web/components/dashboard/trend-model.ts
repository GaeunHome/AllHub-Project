import { monthTotals, type CategoryMonthTotal } from "../../../lib/ledger";
import { formatNumber } from "../../../lib/money";
import { recentMonths, type MonthKey } from "../../../lib/month";
import { niceScale, scalePercent, type NiceScale } from "../../chart-geometry";

// 每月收入與支出兩根長條 共用一個從 0 開始的刻度

export type FlowPoint = { month: MonthKey; income: number; expense: number };

/**
 * 到本月為止最多 count 個月 從最早的帳戶或紀錄的月份開始
 * 剛開始用時不到 12 個月 不畫一排空的月份
 */
export function flowSeries(totals: CategoryMonthTotal[], startMonths: MonthKey[], current: MonthKey, count = 12): FlowPoint[] {
  const starts = [...startMonths, ...totals.map((total) => total.month)];
  if (starts.length === 0) return [];
  const earliest = starts.reduce((a, b) => (b < a ? b : a));
  return recentMonths(current, count)
    .filter((month) => month >= earliest)
    .map((month) => {
      const { income, expense } = monthTotals(totals, month);
      return { month, income, expense };
    });
}

export type FlowColumn = FlowPoint & { incomeHeight: number; expenseHeight: number };

export function flowChart(points: FlowPoint[]): { scale: NiceScale; columns: FlowColumn[]; empty: boolean } {
  const peak = Math.max(0, ...points.flatMap((p) => [p.income, p.expense]));
  const scale = niceScale(0, peak);
  return {
    scale,
    columns: points.map((point) => ({ ...point, incomeHeight: scalePercent(point.income, scale), expenseHeight: scalePercent(point.expense, scale) })),
    empty: peak === 0,
  };
}

/** 滑過優先 其次是鍵盤 都沒有是 null 讀數只放圖例 */
export function readoutIndex(points: FlowPoint[], { hover, focus }: { hover: number | null; focus: number | null }): number | null {
  // 月份變少時舊的滑過或焦點位置可能已經不在 當作沒有 不讓卡片出錯
  const inRange = (index: number | null): index is number => index !== null && index >= 0 && index < points.length;
  return [hover, focus].find(inRange) ?? null;
}

const UNITS = [
  { size: 100_000_000, label: "億" },
  { size: 10_000, label: "萬" },
] as const;

/**
 * 同一軸只用一種寫法 刻度都是單位十分之一的倍數才用萬或億 不會出現 0.25 萬
 * 金額的符號寫在讀數與表格裡
 */
export function axisLabels(ticks: number[]): string[] {
  const top = Math.max(0, ...ticks.map((tick) => Math.abs(tick)));
  const unit = UNITS.find(({ size }) => top >= size && ticks.every((tick) => tick % (size / 10) === 0));
  return ticks.map((tick) => {
    if (tick === 0) return "0";
    return unit ? `${tick / unit.size} ${unit.label}` : formatNumber(tick);
  });
}
