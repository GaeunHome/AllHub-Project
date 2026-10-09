import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { formatTaipeiDateTime } from "@/core/time";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { addMonths, formatMonth, taipeiMonth } from "../../lib/month";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../service/cached", { spy: true });
vi.mock("../actions", () => ({
  addEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  createGoalAction: vi.fn(),
  updateGoalAction: vi.fn(),
  setGoalActiveAction: vi.fn(),
  moveGoalAction: vi.fn(),
  deleteGoalAction: vi.fn(),
}));

const cached = mocksOf(await import("../../service/cached"), "cachedGoals", "cachedEntryTotals", "cachedMonthEntries");
const { SavingsPage } = await import("./savings-page");
const { MonthPanel } = await import("../components/month-panel");
const { EntryDetails } = await import("../components/entry-details");
const { Statistics } = await import("../components/statistics");

const INFO: ModuleInfo = { id: "savings", name: "存錢記帳", href: "/savings", description: "", icon: "/icons/ui/piggy-bank.svg", accent: "green", notifies: false };
const MONTH = taipeiMonth(new Date());
const PREVIOUS = addMonths(MONTH, -1);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const params = (month?: string) => Promise.resolve(month ? { month } : {});
const render = async (node: Promise<unknown>) => renderToStaticMarkup((await node) as ReactElement);

const goal = (id: number, name: string, monthlyAmount: number, active = true) => ({ id, userId: null, name, monthlyAmount, note: null, active, sortOrder: id, createdAt: new Date() });
const GOALS = [goal(1, "緊急預備金", 10000), goal(2, "旅遊基金", 3000), goal(3, "換手機", 2000), goal(4, "換車", 5000, false)];
const total = (month: string, goalId: number | null, goalName: string | null, amount: number) => ({ month, goalId, goalName, amount });
const TOTALS = [
  total(MONTH, 1, "緊急預備金", 10000),
  total(MONTH, 2, "旅遊基金", 1500),
  total(MONTH, null, null, 800),
  total(PREVIOUS, 1, "緊急預備金", 10000),
  total(PREVIOUS, 2, "旅遊基金", 3000),
  total(PREVIOUS, 3, "換手機", 2000),
  total("2025-12", 4, "換車", 5000),
];
const RECORDED_AT = new Date("2026-10-08T14:10:00Z");
const entry = (id: number, goalId: number | null, goalName: string | null, amount: number, note: string | null) => ({ id, userId: null, month: `${MONTH}-01`, goalId, goalName, amount, note, createdAt: RECORDED_AT });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedGoals.mockReset().mockResolvedValue(GOALS);
  cached.cachedEntryTotals.mockReset().mockResolvedValue(TOTALS);
  cached.cachedMonthEntries.mockReset().mockResolvedValue([entry(11, 2, "旅遊基金", 1500, "先存一半"), entry(12, null, null, 800, "發票中獎"), entry(13, null, "舊的保險", 2400, null)]);
});

describe("存錢記帳頁：重點先顯示，次要的收起來", () => {
  it("由上而下是本月總覽與項目，接著是預設收起來的紀錄明細、統計、管理項目", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));
    const text = textOf(markup);

    expect(markup.match(/<details/g)).toHaveLength(3);
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
    expect(text.indexOf("載入本月總覽")).toBeLessThan(text.indexOf("紀錄明細"));
    expect(text.indexOf("紀錄明細")).toBeLessThan(text.indexOf("統計"));
    expect(text.indexOf("統計")).toBeLessThan(text.indexOf("管理項目"));
  });

  it("管理項目裡有新增項目的表單（新增、修改、排序、停用、刪除都收在這裡）", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));
    const manage = markup.slice(markup.lastIndexOf("<details"));

    expect(textOf(manage)).toContain("新增固定項目");
    expect(manage).toContain('name="monthlyAmount"');
  });
});

describe("本月總覽與項目清單", () => {
  it("用登入者的 id 讀項目與紀錄", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await MonthPanel({ searchParams: params() });

    expect(cached.cachedGoals).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedEntryTotals).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("總覽一張卡：月份切換、已存、應存、還差、達成率與存滿的項目數；同一個數字不重複出現", async () => {
    const markup = await render(MonthPanel({ searchParams: params() }));
    const text = textOf(markup);

    expect(markup).toMatch(/<nav[^>]*aria-label="切換月份"/);
    expect(markup).toMatch(new RegExp(`<option value="${MONTH}" selected`));
    expect(text).toContain("本月總覽");
    for (const label of ["已存", "應存", "還差"]) expect(text).toContain(label);
    expect(text).toContain("達成 82%");
    expect(text).toContain("1／3 個項目已存滿");
    expect(markup.match(/\$12,300/g)).toHaveLength(1);
    expect(markup.match(/\$15,000/g)).toHaveLength(1);
    expect(markup.match(/\$3,500/g)).toHaveLength(1);
  });

  it("項目清單：每個啟用中的項目一列，只有名稱、每月金額與狀態標籤；還沒存滿的有「記一筆」，輸入框點了才出現", async () => {
    const markup = await render(MonthPanel({ searchParams: params() }));
    const text = textOf(markup);

    for (const name of ["緊急預備金", "旅遊基金", "換手機"]) expect(text).toContain(name);
    expect(text).not.toContain("換車");
    expect(text).toContain("已存滿");
    expect(text).toContain("還差 $1,500");
    expect(text).toContain("還沒存");
    for (const amount of ["$10,000", "$3,000", "$2,000"]) expect(text).toContain(amount);
    expect(markup.match(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>).)*記一筆/g)).toHaveLength(2);
    expect(markup).not.toContain('name="amount"');
    // 舊版每列都攤開「已存 $X／每月 $Y」與輸入框
    expect(text).not.toContain("已存 $10,000／每月");
  });

  it("臨時存款是一個按鈕，點了才出現輸入框", async () => {
    const markup = await render(MonthPanel({ searchParams: params() }));

    expect(markup).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>).)*臨時存款/);
    expect(markup).not.toContain('name="note"');
  });

  it("切換到過去的月份_總覽與清單都是那個月的，可以回到本月或往前後一個月", async () => {
    const markup = await render(MonthPanel({ searchParams: params(PREVIOUS) }));
    const text = textOf(markup);

    expect(text).toContain(`${formatMonth(PREVIOUS)}總覽`);
    expect(text).toContain("所有項目都存滿了");
    expect(text).toContain("$15,000");
    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>(?:(?!<\/a>).)*回到本月/);
    expect(markup).toContain(`aria-label="下一個月（${formatMonth(MONTH)}）"`);
    expect(markup).toContain(`aria-label="上一個月（${formatMonth(addMonths(PREVIOUS, -1))}）"`);
    expect(markup).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*記一筆/);
  });

  it("項目都停用了_總覽照樣列出這個月存的錢，說明沒有啟用中的項目（不寫 0／0）", async () => {
    cached.cachedGoals.mockResolvedValue([goal(4, "換車", 5000, false)]);

    const text = textOf(await render(MonthPanel({ searchParams: params() })));

    expect(text).toContain("$12,300");
    expect(text).toContain("沒有啟用中的項目");
    expect(text).not.toContain("0／0");
  });

  it("還沒有任何項目_清單直接放新增項目的表單", async () => {
    cached.cachedGoals.mockResolvedValue([]);

    const markup = await render(MonthPanel({ searchParams: params() }));

    expect(textOf(markup)).toContain("還沒有每月固定要存的項目");
    expect(markup).toContain('name="monthlyAmount"');
  });
});

describe("紀錄明細（收起來的區塊）", () => {
  it("用登入者的 id 讀選到的月份", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await EntryDetails({ searchParams: params(PREVIOUS) });

    expect(cached.cachedMonthEntries).toHaveBeenCalledWith(OTHER_SESSION.id, PREVIOUS);
  });

  it("每一筆：項目名稱（已刪除的標示出來）、備註、記錄時間、金額與刪除；合計已經在總覽，不再重複", async () => {
    const markup = await render(EntryDetails({ searchParams: params() }));
    const text = textOf(markup);

    for (const word of ["旅遊基金", "先存一半", "臨時存款", "發票中獎", "舊的保險", "已刪除", "$1,500", "$800", "$2,400", formatTaipeiDateTime(RECORDED_AT)]) {
      expect(text).toContain(word);
    }
    expect(markup).toContain('aria-label="刪除「旅遊基金」$1,500 這筆紀錄"');
    expect(text).not.toContain("合計");
  });

  it("沒有紀錄_一行說明", async () => {
    cached.cachedMonthEntries.mockResolvedValue([]);

    expect(textOf(await render(EntryDetails({ searchParams: params() })))).toContain("這個月還沒有紀錄");
  });
});

describe("統計（收起來的區塊）", () => {
  it("今年累計、全部累計、最近 12 個月的長條圖（點了切換月份）與各項目累計", async () => {
    const markup = await render(Statistics({ searchParams: params() }));
    const text = textOf(markup);

    expect(text).toContain(`${MONTH.slice(0, 4)} 年累計`);
    expect(text).toContain("全部累計");
    expect(markup.match(/aria-label="\d{4} 年 \d{1,2} 月：[^"]*查看這個月的紀錄"/g)).toHaveLength(12);
    expect(text).toContain("各項目累計");
    expect(text).toContain("以表格檢視");
    expect(text).toContain("已停用");
  });
});
