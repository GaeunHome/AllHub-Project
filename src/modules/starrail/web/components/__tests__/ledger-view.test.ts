import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { Ledger } from "../../../lib/ledger";
import { LedgerView } from "../ledger-view";

const ledger = (month: string, jade: number, passes: number, sources: Ledger["sources"] = []): Ledger => ({
  month,
  months: ["202609", "202610", "202611"],
  current: { jade, passes },
  today: { jade: 120, passes: 0 },
  sources,
});
const SOURCES = [
  { id: "a", name: "活動獎勵", amount: 1940, percent: 27 },
  { id: "b", name: "每日獎勵", amount: 1800, percent: 25 },
  { id: "c", name: "模擬宇宙", amount: 900, percent: 13 },
];
const LEDGERS = [ledger("202609", 3600, 6), ledger("202610", 5400, 12), ledger("202611", 7200, 9, SOURCES)];
const render = () => markup(createElement(LedgerView, { ledgers: LEDGERS, current: "202611", fetchedLabel: "今天 13:57" }));

/** 某一張圖裡每一根的高度或寬度 依畫面上的順序 */
const sizes = (html: string, label: string, prop: "height" | "width") => {
  const start = html.indexOf(`aria-label="${label}"`);
  const chart = html.slice(start, html.indexOf("</figure>", start));
  return [...chart.matchAll(new RegExp(`style="${prop}:([\\d.]+)%"`, "g"))].map(([, value]) => Number(value));
};

describe("開拓月曆（使用者要的：好看一點，不要只有字）", () => {
  it("星瓊與車票各有最近三個月的直條，照最多的那個月算高度（星瓊 3,600、5,400、7,200；車票 6、12、9）", () => {
    const html = render();

    expect(sizes(html, "最近三個月的星瓊", "height")).toEqual([50, 75, 100]);
    expect(sizes(html, "最近三個月的車票", "height")).toEqual([50, 100, 75]);
    expect(textOf(html, { spaced: true })).toContain("3,600");
  });

  it("選到的月份（一開始是本月）在直條上強調", () => {
    const html = render();
    const start = html.indexOf('aria-label="最近三個月的星瓊"');
    const selected = [...html.slice(start, html.indexOf("</figure>", start)).matchAll(/<li[^>]*data-selected=""[^>]*>(.*?)<\/li>/g)].map(([, inner]) => textOf(inner, { spaced: true }));

    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain("11 月");
  });

  it("星瓊來源由多到少一項一條橫條，最多的最長（1,940、1,800、900 是 100%、92.8%、46.4%），數量與百分比寫在旁邊", () => {
    const html = render();
    const text = textOf(html, { spaced: true });

    expect(sizes(html, "星瓊來源", "width")).toEqual([100, 92.8, 46.4]);
    expect(text).toContain("1,940");
    expect(text).toContain("27%");
  });
});
