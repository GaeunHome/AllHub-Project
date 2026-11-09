import type { AssetTrendPoint } from "../../../lib/trend";
import { niceScale, scalePercent, type NiceScale } from "./chart-geometry";

// 存款與投資疊成一根 共用一個從 0 開始的刻度

/** height 是整根的高度 兩段照金額分 負的當成 0 畫 數字照實寫在讀數與表格 */
export type AssetColumn = { height: number; depositShare: number; investmentShare: number };

export function assetChart(points: readonly AssetTrendPoint[]): { scale: NiceScale; columns: AssetColumn[]; empty: boolean } {
  const parts = points.map((point) => ({ deposit: Math.max(point.deposit, 0), investment: Math.max(point.investment, 0) }));
  const peak = Math.max(0, ...parts.map(({ deposit, investment }) => deposit + investment));
  const scale = niceScale(0, peak);
  return {
    scale,
    columns: parts.map(({ deposit, investment }) => ({ height: scalePercent(deposit + investment, scale), depositShare: deposit, investmentShare: investment })),
    empty: peak === 0,
  };
}
