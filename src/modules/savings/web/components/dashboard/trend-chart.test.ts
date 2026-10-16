import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendChart } from "./trend-chart";
import type { FlowPoint } from "./trend-model";

const point = (month: string, income: number, expense: number): FlowPoint => ({ month, income, expense });
const POINTS = [point("2025-12", 43000, 21000), point("2026-01", 43000, 38000), point("2026-02", 0, 12000), point("2026-03", 45000, 28500)];
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const render = () => renderToStaticMarkup(createElement(TrendChart, { points: POINTS, current: "2026-03" }));

describe("每月收支", () => {
  it("只有收入與支出一張圖，不再切換到資產", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>每月收支<\/h2>/);
    expect(markup).not.toContain("segmented");
    expect(textOf(markup)).not.toContain("資產");
  });

  it("每個月一個連結到紀錄頁看那個月，本月不帶月份；名稱寫出月份與金額", () => {
    const links = [...render().matchAll(/<a [^>]*aria-label="([^"]*)"[^>]*>/g)].map((m) => m[0]);

    expect(links).toHaveLength(4);
    expect(links[0]).toContain('href="/savings/records?month=2025-12"');
    expect(links[0]).toContain('aria-label="2025 年 12 月：收入 $43,000，支出 $21,000，查看這個月的紀錄"');
    expect(links[3]).toContain('href="/savings/records"');
  });

  it("y 軸用簡短的金額（萬），年份寫在第一個月與一月", () => {
    const markup = render();
    const ticks = markup.match(/<ol class="fin-chart-ticks" aria-hidden="true">(.*?)<\/ol>/)![1];
    const months = markup.match(/<ol class="fin-chart-months" aria-hidden="true"[^>]*>(.*?)<\/ol>/)![1];

    expect(textOf(ticks)).toBe("6 萬4 萬2 萬0");
    expect(textOf(months)).toContain("2025");
    expect(textOf(months)).toContain("2026");
  });

  it("以表格檢視：每個月的收入與支出，新的在上面", () => {
    const markup = render();
    const rows = [...markup.slice(markup.indexOf("<details")).matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => textOf(m[1]));

    expect(rows[0]).toBe("月份收入支出");
    expect(rows[1]).toBe("2026 年 3 月$45,000$28,500");
    expect(rows).toHaveLength(5);
  });
});
