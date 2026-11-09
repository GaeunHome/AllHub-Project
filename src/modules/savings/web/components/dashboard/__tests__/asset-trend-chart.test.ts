import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { AssetTrendPoint } from "../../../../lib/trend";
import { AssetTrendChart } from "../asset-trend-chart";
import { assetChart } from "../asset-trend-model";

const point = (month: string, deposit: number, investment: number, atCost = false): AssetTrendPoint => ({ month, deposit, investment, total: deposit + investment, atCost });
const POINTS = [point("2026-07", 12_000, 0), point("2026-08", 8_000, 4_000, true), point("2026-09", 39_000, 5_200)];
const render = () => markup(createElement(AssetTrendChart, { points: POINTS, current: "2026-09" }));

describe("資產走勢：使用者選的疊起來的長條", () => {
  it("刻度從 0 到總資產最高的那個月之上：44,200 用 2 萬一格到 6 萬，那根高 73.67%，兩段照存款與投資的金額分", () => {
    const chart = assetChart(POINTS);

    expect(chart.scale.ticks).toEqual([0, 20_000, 40_000, 60_000]);
    expect(chart.columns[2]).toEqual({ height: 73.67, depositShare: 39_000, investmentShare: 5_200 });
    expect(chart.empty).toBe(false);
  });

  it("負的存款不往下畫（當成 0），全部是 0 時說還沒有存款或投資", () => {
    expect(assetChart([point("2026-09", -500, 1_000)]).columns[0]).toMatchObject({ depositShare: 0, investmentShare: 1_000 });
    expect(assetChart([point("2026-09", 0, 0)]).empty).toBe(true);
    expect(textOf(markup(createElement(AssetTrendChart, { points: [point("2026-09", 0, 0)], current: "2026-09" })))).toContain("還沒有存款或投資");
  });

  it("每個月一個連結到紀錄頁看那個月，名稱寫出總資產、存款與投資，照成本算的月份寫出來", () => {
    const labels = [...render().matchAll(/aria-label="([^"]*查看這個月的紀錄)"/g)].map((m) => m[1]);

    expect(labels).toEqual([
      "2026 年 7 月：總資產 $12,000，存款 $12,000，投資 $0，查看這個月的紀錄",
      "2026 年 8 月：總資產 $12,000，存款 $8,000，投資 $4,000（照成本），查看這個月的紀錄",
      "2026 年 9 月：總資產 $44,200，存款 $39,000，投資 $5,200，查看這個月的紀錄",
    ]);
  });

  it("以表格檢視：新的在上面", () => {
    const page = render();
    const rows = [...page.slice(page.indexOf("<details")).matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => textOf(m[1]));

    expect(rows[0]).toBe("月份總資產存款投資");
    expect(rows[1]).toBe("2026 年 9 月$44,200$39,000$5,200");
    expect(rows[2]).toBe("2026 年 8 月$12,000$8,000$4,000（照成本）");
  });
});
