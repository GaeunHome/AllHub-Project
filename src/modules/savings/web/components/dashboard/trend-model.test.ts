import { describe, expect, it } from "vitest";
import type { TrendPoint } from "../../../lib/ledger";
import { assetChart, flowChart, readoutIndex } from "./trend-model";

const point = (month: string, income: number, expense: number, assets: number): TrendPoint => ({ month, income, expense, assets });
const POINTS = [point("2026-07", 43000, 21000, 100000), point("2026-08", 43000, 38000, 105000), point("2026-09", 0, 12000, 93000), point("2026-10", 45000, 28500, 112000)];

describe("收支的長條", () => {
  it("刻度從 0 到收入、支出裡最大的那個往上取整；每個月兩根長條的高度是刻度的百分比", () => {
    const chart = flowChart(POINTS);

    expect(chart.scale.ticks).toEqual([0, 20000, 40000, 60000]);
    expect(chart.columns[0]).toEqual({ month: "2026-07", income: 43000, expense: 21000, incomeHeight: 71.67, expenseHeight: 35 });
    expect(chart.columns[2].incomeHeight).toBe(0);
    expect(chart.empty).toBe(false);
  });

  it("最近 12 個月都沒有收入或支出_標成空的，畫面改寫一句說明", () => {
    expect(flowChart([point("2026-10", 0, 0, 5000)]).empty).toBe(true);
  });
});

describe("資產的折線", () => {
  it("點放在每一欄的正中間，高度照刻度；折線與底下淡淡的面積一起畫，面積收在 0 的高度", () => {
    const chart = assetChart(POINTS);

    expect(chart.scale.ticks).toEqual([0, 50000, 100000, 150000]);
    expect(chart.points.map((p) => p.x)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(chart.points[0].y).toBe(66.67);
    expect(chart.line.startsWith("M12.5 33.33L37.5 30")).toBe(true);
    expect(chart.area.endsWith("L87.5 100Z")).toBe(true);
    expect(chart.baseline).toBe(0);
  });

  it("資產有負的月份：刻度往下延伸，面積收在 0 的那條線", () => {
    const chart = assetChart([point("2026-09", 0, 0, -3000), point("2026-10", 0, 0, 9000)]);

    expect(chart.scale.min).toBeLessThan(0);
    expect(chart.baseline).toBeGreaterThan(0);
  });

  it("只有一個月_畫不出線，只有一個點", () => {
    const chart = assetChart([point("2026-10", 0, 0, 52000)]);

    expect(chart.line).toBe("");
    expect(chart.points).toHaveLength(1);
  });
});

describe("上方那一行讀數顯示哪個月", () => {
  it("滑過的月份優先，其次是鍵盤移到的，再來是選到的月份，都沒有就是最新的月份", () => {
    expect(readoutIndex(POINTS, { hover: 1, focus: 2 }, "2026-08")).toBe(1);
    expect(readoutIndex(POINTS, { hover: null, focus: 2 }, "2026-08")).toBe(2);
    expect(readoutIndex(POINTS, { hover: null, focus: null }, "2026-08")).toBe(1);
    expect(readoutIndex(POINTS, { hover: null, focus: null }, "2025-01")).toBe(3);
  });
});
