import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TrendPoint } from "../../../lib/ledger";
import { TrendChart } from "./trend-chart";

const point = (month: string, income: number, expense: number, assets: number): TrendPoint => ({ month, income, expense, assets });
const POINTS = [point("2025-12", 43000, 21000, 100000), point("2026-01", 43000, 38000, 105000), point("2026-02", 0, 12000, 93000), point("2026-03", 45000, 28500, 112000)];
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const render = (props: Partial<Parameters<typeof TrendChart>[0]> = {}) => renderToStaticMarkup(createElement(TrendChart, { points: POINTS, selected: "2026-02", ...props }));

describe("最近 12 個月的趨勢", () => {
  it("標題列右邊切換收支與資產（兩張圖各自一個刻度，不是雙 y 軸），預設是收支", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>每月趨勢<\/h2>/);
    expect(markup).toMatch(/<div role="group" aria-label="趨勢的內容" class="segmented">/);
    expect(markup).toMatch(/aria-pressed="true" class="segmented-option">收支</);
  });

  it("圖上面一行寫出選到的月份的收入、支出與存下（滑過其他月份時跟著換），收入、支出前面的色塊就是圖例", () => {
    const readout = render().match(/<p class="fin-readout"[^>]*>(.*?)<\/p>/)![1];

    expect(textOf(readout)).toBe("2026 年 2 月收入$0支出$12,000存下-$12,000");
    expect(readout).toContain("fin-key fin-key-income");
    expect(readout).toContain("fin-key fin-key-expense");
  });

  it("每個月兩根長條，高度是刻度的百分比，依序錯開長出來；長條只是畫面，報讀器讀每個月的連結", () => {
    const markup = render();
    const bars = [...markup.matchAll(/<span class="fin-bar fin-bar-(income|expense)" style="([^"]*)"/g)];

    expect(bars).toHaveLength(8);
    expect(bars[0][2]).toContain("height:71.67%");
    expect(bars[1][2]).toContain("height:35%");
    expect(bars[2][2]).toContain("--i:1");
    expect(markup).toMatch(/<div class="fin-bars" aria-hidden="true"/);
  });

  it("每個月一個連結：點了切換總覽的月份；名稱寫出月份與金額，選到的月份標成目前", () => {
    const markup = render();
    const links = [...markup.matchAll(/<a [^>]*aria-label="([^"]*)"[^>]*>/g)].map((m) => m[0]);

    expect(links).toHaveLength(4);
    expect(links[0]).toContain('href="/savings?month=2025-12"');
    expect(links[0]).toContain('aria-label="2025 年 12 月：收入 $43,000，支出 $21,000，查看這個月"');
    expect(links[2]).toContain('aria-current="true"');
    expect(links.filter((link) => link.includes("aria-current"))).toHaveLength(1);
  });

  it("y 軸用簡短的金額（萬），x 軸依圖的寬度寫「月」或只寫數字，年份寫在第一個月與一月", () => {
    const markup = render();
    const ticks = markup.match(/<ol class="fin-chart-ticks" aria-hidden="true">(.*?)<\/ol>/)![1];
    const months = markup.match(/<ol class="fin-chart-months" aria-hidden="true"[^>]*>(.*?)<\/ol>/)![1];

    expect(textOf(ticks)).toBe("6 萬4 萬2 萬0");
    expect(months).toContain('<span class="@sm:hidden">12</span><span class="hidden @sm:inline">12 月</span>');
    expect(textOf(months)).toContain("2025");
    expect(textOf(months)).toContain("2026");
  });

  it("以表格檢視：每個月的收入、支出與月底資產，新的在上面", () => {
    const markup = render();
    const table = markup.slice(markup.indexOf("<details"));

    expect(table).toMatch(/<summary>以表格檢視<\/summary>/);
    const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => textOf(m[1]));
    expect(rows[0]).toBe("月份收入支出月底資產");
    expect(rows[1]).toBe("2026 年 3 月$45,000$28,500$112,000");
    expect(rows).toHaveLength(5);
  });

  it("資產：一條折線加淡淡的面積，最新的月份有一個點；上面寫月底的總資產與比上個月多或少多少", () => {
    const markup = render({ initialMode: "assets" });

    expect(markup).toMatch(/aria-pressed="true" class="segmented-option">資產</);
    expect(markup).toMatch(/<path class="fin-line-path" d="M[^"]+" vector-effect="non-scaling-stroke"/);
    expect(markup).toMatch(/<path class="fin-line-area" d="M[^"]+Z"/);
    expect(textOf(markup.match(/<p class="fin-readout"[^>]*>(.*?)<\/p>/)![1])).toBe("2026 年 2 月底總資產$93,000比上個月-$12,000");
    expect(markup).not.toContain("fin-bar ");
  });
});
