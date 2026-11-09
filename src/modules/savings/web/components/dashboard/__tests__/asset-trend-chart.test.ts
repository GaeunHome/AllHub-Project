import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { addDays } from "../../../../lib/dates";
import type { AssetTrendPoint } from "../../../../lib/trend";
import { AssetTrendChart } from "../asset-trend-chart";
import { assetChart } from "../asset-trend-model";

const point = (day: string, deposit: number, investment: number, atCost = false): AssetTrendPoint => ({ day, deposit, investment, total: deposit + investment, atCost });
const POINTS = [point("2026-08-31", 12_000, 0), point("2026-09-01", 8_000, 4_000, true), point("2026-09-02", 39_000, 5_200)];
const render = (points = POINTS, today = "2026-09-02") => markup(createElement(AssetTrendChart, { points, today }));

describe("資產走勢：使用者選的近 30 天每天一根疊起來的長條", () => {
  it("刻度從 0 到總資產最高的那天之上：44,200 用 2 萬一格到 6 萬，那根高 73.67%，兩段照存款與投資的金額分", () => {
    const chart = assetChart(POINTS);

    expect(chart.scale.ticks).toEqual([0, 20_000, 40_000, 60_000]);
    expect(chart.columns[2]).toEqual({ height: 73.67, depositShare: 39_000, investmentShare: 5_200 });
    expect(chart.empty).toBe(false);
  });

  it("負的存款不往下畫（當成 0），全部是 0 時說還沒有存款或投資", () => {
    expect(assetChart([point("2026-09-02", -500, 1_000)]).columns[0]).toMatchObject({ depositShare: 0, investmentShare: 1_000 });
    expect(assetChart([point("2026-09-02", 0, 0)]).empty).toBe(true);
    expect(textOf(render([point("2026-09-02", 0, 0)]))).toContain("還沒有存款或投資");
  });

  it("每天一個連結到紀錄頁看那天的那個月（這個月不帶月份），名稱寫出日期、總資產、存款與投資，照成本算的日子寫出來", () => {
    const page = render();
    const attribute = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    const links = [...page.matchAll(/<a [^>]*>/g)].map(([tag]) => [attribute(tag, "href"), attribute(tag, "aria-label")]);

    expect(links).toEqual([
      ["/savings/records?month=2026-08", "8 月 31 日（一）：總資產 $12,000，存款 $12,000，投資 $0，查看這個月的紀錄"],
      ["/savings/records", "9 月 1 日（二）：總資產 $12,000，存款 $8,000，投資 $4,000（照成本），查看這個月的紀錄"],
      ["/savings/records", "9 月 2 日（三）：總資產 $44,200，存款 $39,000，投資 $5,200，查看這個月的紀錄"],
    ]);
  });

  it("30 根時底下不是每天都寫日期：從今天往回每 7 天寫一個", () => {
    const month = Array.from({ length: 30 }, (_, i) => point(addDays("2026-08-22", i), 1_000, 0));
    const page = render(month, "2026-09-20");
    const axis = page.match(/<ol class="fin-chart-months" aria-hidden="true"[^>]*>(.*?)<\/ol>/)![1];

    expect(textOf(axis, { spaced: true }).trim().split(" ")).toEqual(["8/23", "8/30", "9/6", "9/13", "9/20"]);
  });

  it("以表格檢視：新的在上面", () => {
    const page = render();
    const rows = [...page.slice(page.indexOf("<details")).matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => textOf(m[1]));

    expect(rows[0]).toBe("日期總資產存款投資");
    expect(rows[1]).toBe("9 月 2 日（三）$44,200$39,000$5,200");
    expect(rows[2]).toBe("9 月 1 日（二）$12,000$8,000$4,000（照成本）");
  });
});
