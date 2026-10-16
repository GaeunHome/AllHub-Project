import { describe, expect, it } from "vitest";
import type { CategoryMonthTotal } from "../../../lib/ledger";
import { flowChart, flowSeries, readoutIndex, type FlowPoint } from "./trend-model";

const point = (month: string, income: number, expense: number): FlowPoint => ({ month, income, expense });
const total = (kind: "income" | "expense", month: string, amount: number, categoryId: number | null = null): CategoryMonthTotal => ({ categoryId, kind, month, amount });

describe("每月收支的月份", () => {
  it("到本月為止，從最早的帳戶或紀錄的月份開始；每個月的收入、支出是各分類的合計", () => {
    const points = flowSeries([total("expense", "2026-09", 1200, 1), total("expense", "2026-09", 300, 2), total("income", "2026-10", 43000)], ["2026-08"], "2026-10");

    expect(points).toEqual([point("2026-08", 0, 0), point("2026-09", 0, 1500), point("2026-10", 43000, 0)]);
  });

  it("用了超過一年_只畫最近 12 個月", () => {
    const points = flowSeries([total("income", "2024-05", 100)], ["2024-01"], "2026-10");

    expect(points).toHaveLength(12);
    expect(points[0].month).toBe("2025-11");
    expect(points.at(-1)?.month).toBe("2026-10");
  });
});

describe("收支的長條", () => {
  it("刻度從 0 到收入、支出裡最大的那個往上取整；每個月兩根長條的高度是刻度的百分比", () => {
    const chart = flowChart([point("2026-07", 43000, 21000), point("2026-08", 0, 12000)]);

    expect(chart.scale.ticks).toEqual([0, 20000, 40000, 60000]);
    expect(chart.columns[0]).toMatchObject({ incomeHeight: 71.67, expenseHeight: 35 });
    expect(chart.columns[1]).toMatchObject({ incomeHeight: 0, expenseHeight: 20 });
    expect(chart.empty).toBe(false);
  });

  it("都沒有收入或支出_標成空的，畫面改寫一句說明", () => {
    expect(flowChart([point("2026-10", 0, 0)]).empty).toBe(true);
  });
});

describe("圖上面那一行讀數寫哪個月", () => {
  const POINTS = [point("2026-07", 43000, 21000), point("2026-08", 43000, 38000), point("2026-09", 0, 12000), point("2026-10", 45000, 28500)];

  it("滑過的月份優先，其次是鍵盤移到的；都沒有時不寫（本月的數字頁首已經寫了，只留圖例）", () => {
    expect(readoutIndex(POINTS, { hover: 1, focus: 2 })).toBe(1);
    expect(readoutIndex(POINTS, { hover: null, focus: 2 })).toBe(2);
    expect(readoutIndex(POINTS, { hover: null, focus: null })).toBeNull();
  });

  it("月份變少了，舊的滑過或焦點位置已經不在圖上_當成沒有，換成另一個還在的", () => {
    expect(readoutIndex(POINTS.slice(0, 2), { hover: 3, focus: null })).toBeNull();
    expect(readoutIndex(POINTS.slice(0, 2), { hover: 3, focus: 1 })).toBe(1);
  });
});
