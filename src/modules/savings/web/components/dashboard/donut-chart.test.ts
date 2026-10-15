import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Slice } from "../../../lib/ledger";
import { DonutChart } from "./donut-chart";

const SLICES: Slice[] = [
  { key: "category:1", label: "餐飲", color: "orange", amount: 6000, percent: 60 },
  { key: "category:2", label: "交通", color: "blue", amount: 3000, percent: 30 },
  { key: "uncategorized", label: "未分類", color: "slate", amount: 1000, percent: 10 },
];
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const render = (props: Partial<Parameters<typeof DonutChart>[0]> = {}) =>
  renderToStaticMarkup(createElement(DonutChart, { label: "本月支出分類", slices: SLICES, center: { label: "本月支出", amount: 10000 }, selected: null, onSelect: vi.fn(), ...props }));
const arcs = (markup: string) => [...markup.matchAll(/<circle class="fin-donut-arc"[^>]*style="([^"]*)"/g)].map((m) => m[1]);

describe("圓餅圖（甜甜圈）", () => {
  it("每一片一段圓弧：長度與起點是圓周的百分比（片與片之間留一點縫），依序帶 --i 錯開進場", () => {
    const styles = arcs(render());

    expect(styles).toHaveLength(3);
    expect(styles[0]).toContain("stroke-dasharray:59.2 40.8");
    expect(styles[0]).toContain("stroke-dashoffset:-0.4");
    expect(styles[1]).toContain("stroke-dashoffset:-60.4");
    expect(styles[2]).toContain("--i:2");
    expect(styles[0]).toContain("--fin-color:var(--fin-orange)");
  });

  it("圖例是按鈕：名稱、金額與百分比都是文字（圖不是唯一的讀法），圓環本身對報讀器隱藏", () => {
    const markup = render();
    const legend = markup.slice(markup.indexOf('<ul aria-label="本月支出分類的圖例"'));
    const buttons = [...legend.matchAll(/<button type="button"[^>]*aria-pressed="false"[^>]*>(.*?)<\/button>/g)].map((m) => textOf(m[1]));

    expect(buttons).toEqual(["餐飲$6,00060.0%", "交通$3,00030.0%", "未分類$1,00010.0%"]);
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("中間平常是合計；報讀器另外讀到一句合計（中間的字會跟著滑過的片變，所以對報讀器隱藏）", () => {
    const markup = render();

    expect(markup).toMatch(/<p class="sr-only">本月支出 \$10,000，分成 3 類<\/p>/);
    expect(markup).toMatch(/<div class="fin-donut-center" aria-hidden="true">/);
    expect(textOf(markup)).toContain("本月支出");
  });

  it("選到一片：圖例那一列標成按下，中間改成那一片的名稱、金額與百分比，圓環標出選到的那一片", () => {
    const markup = render({ selected: "category:2" });

    expect(markup).toMatch(/<button type="button"[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*交通/);
    expect(markup).toMatch(/<div class="fin-donut-figure" data-active="">/);
    expect(markup).toMatch(/<circle class="fin-donut-arc" data-active=""[^>]*--fin-color:var\(--fin-blue\)/);
    const center = markup.match(/<div class="fin-donut-center" aria-hidden="true">(.*?)<\/div><\/div>/)![1];
    expect(center).toMatch(/<span class="fin-donut-center-total" hidden="">/);
    expect(textOf(center)).toContain("交通$3,00030.0%");
  });

  it("沒有選到的片（或選到的已經不在這一組）：中間顯示合計", () => {
    const markup = render({ selected: "category:99" });

    expect(markup).not.toContain('aria-pressed="true"');
    expect(markup).toMatch(/<div class="fin-donut-figure">/);
  });
});
