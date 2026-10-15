import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Slice } from "../../../lib/ledger";
import type { ExpenseRecord } from "../../dashboard-view";
import { AssetDonutCard } from "./asset-donut-card";
import { ExpenseDonutCard, ExpenseRecordsPanel, recordsForSlice } from "./expense-donut-card";

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const slice = (key: string, label: string, amount: number, percent: number, color: Slice["color"] = "blue"): Slice => ({ key, label, color, amount, percent });

describe("資產分布（可以切換依用途或依帳戶）", () => {
  const BY_PURPOSE = [slice("purpose:1", "生活費", 60000, 60), slice("purpose:2", "緊急預備金", 40000, 40, "amber")];
  const BY_ACCOUNT = [slice("account:1", "國泰", 50000, 50), slice("account:2", "一銀", 10000, 10, "teal"), slice("account:5", "郵局", 40000, 40, "green")];
  const render = () => renderToStaticMarkup(createElement(AssetDonutCard, { title: "資產分布", byPurpose: BY_PURPOSE, byAccount: BY_ACCOUNT, excluded: [] }));

  it("標題列右邊是分段選擇（用途／帳戶），預設依用途", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>資產分布<\/h2>/);
    expect(markup).toMatch(/<div role="group" aria-label="資產分布的分組方式" class="segmented">/);
    expect(markup).toMatch(/<button type="button" aria-pressed="true" class="segmented-option">依用途<\/button>/);
    expect(markup).toMatch(/<button type="button" aria-pressed="false" class="segmented-option">依帳戶<\/button>/);
  });

  it("先畫依用途的片；圓弧數量取兩組比較多的，切換時多的那幾段從終點長出來", () => {
    const markup = render();

    expect(textOf(markup)).toContain("生活費");
    expect(textOf(markup)).not.toContain("一銀");
    expect(markup.match(/<circle class="fin-donut-arc"/g)).toHaveLength(3);
    expect(markup).toContain("資產合計 $100,000，分成 2 類");
  });

  it("卡片依自己的寬度排圓環與圖例（容器查詢）", () => {
    expect(render()).toMatch(/^<section[^>]*class="card stack @container[^"]*"/);
  });
});

describe("本月支出分類（點一片列出這個分類的紀錄）", () => {
  const SLICES = [slice("category:1", "餐飲", 900, 75, "orange"), slice("uncategorized", "未分類", 300, 25, "slate")];
  const record = (id: number, sliceKey: string, amount: number, extra: Partial<ExpenseRecord> = {}): ExpenseRecord => ({ id, date: `2026-10-${String(20 - id).padStart(2, "0")}`, sliceKey, accountName: "國泰", note: null, amount, recurring: false, ...extra });
  const RECORDS = [record(1, "category:1", 120, { note: "午餐" }), record(2, "uncategorized", 300), record(3, "category:1", 780, { accountName: "國泰信用卡", recurring: true })];

  it("一開始只有圓環與圖例，紀錄清單在點了某一片才出現", () => {
    const markup = renderToStaticMarkup(createElement(ExpenseDonutCard, { title: "本月支出分類", slices: SLICES, total: 1200, totalLabel: "本月支出", records: RECORDS, period: "本月", month: null }));

    expect(markup).toMatch(/<h2[^>]*>本月支出分類<\/h2>/);
    expect(markup).not.toContain("的紀錄");
    expect(markup).toMatch(/aria-controls="[^"]+"/);
  });

  it("挑出這一片的紀錄（新的在前，照傳進來的順序），最多列幾筆、其餘算出還有幾筆", () => {
    expect(recordsForSlice(RECORDS, "category:1", 8)).toEqual({ shown: [RECORDS[0], RECORDS[2]], more: 0 });
    expect(recordsForSlice(RECORDS, "category:1", 1)).toEqual({ shown: [RECORDS[0]], more: 1 });
    expect(recordsForSlice(RECORDS, "category:9", 8)).toEqual({ shown: [], more: 0 });
  });

  it("紀錄清單：標題寫分類與月份、筆數；每一筆有日期（同一個月只寫日）、備註（沒有備註寫帳戶）、帳戶、自動記的標籤與金額；可以收起，也能到紀錄頁看全部", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpenseRecordsPanel, { id: "fin-expense-records", slice: SLICES[0], records: [RECORDS[0], RECORDS[2]], more: 0, period: "本月", month: null, onClose: () => {} }),
    );
    const text = textOf(markup);

    expect(markup).toMatch(/^<section id="fin-expense-records" aria-labelledby="fin-expense-records-title"/);
    expect(text).toContain("餐飲・本月的紀錄");
    expect(text).toContain("2 筆");
    expect(text).toContain("19 日（一）");
    expect(text).not.toContain("10 月 19 日");
    expect(text).toContain("午餐");
    expect(text).toContain("國泰信用卡");
    expect(text).toContain("自動");
    expect(text).toContain("$780");
    // 手機上標題列放不下文字按鈕 只放圖示 名稱寫在 aria-label
    expect(markup).toMatch(/<button type="button"[^>]*aria-label="收起紀錄"[^>]*class="icon-button"/);
    expect(markup).toMatch(/<a[^>]*href="\/savings\/records"[^>]*>(?:(?!<\/a>).)*紀錄頁/);
  });

  it("超過列出的筆數_寫出還有幾筆，連到紀錄頁", () => {
    const markup = renderToStaticMarkup(createElement(ExpenseRecordsPanel, { id: "x", slice: SLICES[0], records: [RECORDS[0]], more: 4, period: "9 月", month: "2026-09", onClose: () => {} }));

    expect(textOf(markup)).toContain("還有 4 筆");
    expect(textOf(markup)).toContain("5 筆");
    expect(markup).toContain('href="/savings/records?month=2026-09&amp;category=1"');
  });
});
