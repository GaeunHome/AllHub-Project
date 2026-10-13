import { createElement, isValidElement, type ReactElement } from "react";
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
vi.mock("@/core/ui/dialog", { spy: true });
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
const dialog = await import("@/core/ui/dialog");
const { SavingsPage } = await import("./savings-page");
const { MonthPanel, MonthPanelSkeleton } = await import("../components/month-panel");
const { EntryDetails } = await import("../components/entry-details");
const { FirstGoalForm } = await import("../components/goal-forms");
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

  it("寬螢幕：總覽與項目清單包成左邊一欄、收起來的區塊在右邊，頁首撐滿；左邊一欄不靠第幾個子元素排", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));
    const root = markup.match(/^<div[^>]*class="([^"]*)"/)![1].split(" ");

    expect(root).toEqual(expect.arrayContaining(["xl:grid", "xl:grid-cols-2", "xl:items-start"]));
    expect(root.filter((c) => /(?:nth|last|only)-child/.test(c))).toEqual([]);
    expect(markup).toMatch(/<\/header><div class="page-stack">(?:(?!<details).)*載入本月總覽/);
  });

  it("整頁的視窗共用一個訊息範圍：新的成功訊息出現時，其他視窗留下的舊訊息就收起來", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
    const { children } = vi.mocked(dialog.DialogMessageScope).mock.calls[0][0];
    const scoped = renderToStaticMarkup(children as ReactElement);
    for (const section of ["載入本月總覽", "紀錄明細", "統計", "管理項目"]) expect(textOf(scoped)).toContain(section);
    expect(markup).toBe(scoped);
  });

  it("管理項目裡有「新增固定項目」按鈕（新增、修改、排序、停用、刪除都收在這裡），表單在彈出視窗裡、點了才出現", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));
    const manage = markup.slice(markup.lastIndexOf("<details"));

    expect(manage).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*新增固定項目/);
    expect(manage).toMatch(/<dialog[^>]*class="dialog /);
    expect(manage).not.toContain('name="monthlyAmount"');
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

  it("載入中的總覽骨架跟內容用同一套容器查詢排三個金額：寬螢幕的記帳頁分成兩欄、這張卡變窄時，載入完不會從三欄跳成一欄", async () => {
    const content = await render(MonthPanel({ searchParams: params() }));
    const skeleton = renderToStaticMarkup(createElement(MonthPanelSkeleton));
    const tileGrid = (markup: string) => markup.match(/<(?:dl|div) class="(grid grid-cols-1 gap-4 [^"]*grid-cols-3[^"]*)"/)![1];

    expect(tileGrid(skeleton)).toBe(tileGrid(content));
    expect(skeleton.slice(0, skeleton.indexOf(tileGrid(skeleton)))).toContain("@container");
  });

  it("項目清單：每個啟用中的項目一列，只有名稱、每月金額與狀態標籤；還沒存滿的有「記一筆」，輸入框在點了才出現的彈出視窗裡", async () => {
    const markup = await render(MonthPanel({ searchParams: params() }));
    const text = textOf(markup);

    for (const name of ["緊急預備金", "旅遊基金", "換手機"]) expect(text).toContain(name);
    expect(text).not.toContain("換車");
    expect(text).toContain("已存滿");
    expect(text).toContain("還差 $1,500");
    expect(text).toContain("還沒存");
    for (const amount of ["$10,000", "$3,000", "$2,000"]) expect(text).toContain(amount);
    expect(markup.match(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>).)*記一筆/g)).toHaveLength(2);
    expect(markup.match(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*記一筆/g)).toHaveLength(2);
    expect(markup).not.toContain('name="amount"');
    // 舊版每列都攤開「已存 $X／每月 $Y」與輸入框
    expect(text).not.toContain("已存 $10,000／每月");
  });

  it("臨時存款是一個按鈕，點了才在彈出視窗裡出現輸入框", async () => {
    const markup = await render(MonthPanel({ searchParams: params() }));

    expect(markup).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>).)*臨時存款/);
    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*臨時存款/);
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

  it("新增第一個項目的表單有沒有項目都在項目卡片的同一個位置：表單換成清單時元件留著，成功訊息不會跟著表單一起不見", async () => {
    const slot = async () => {
      const panel = (await MonthPanel({ searchParams: params() })) as ReactElement<{ children: ReactElement<{ children: unknown[] }>[] }>;
      const card = panel.props.children[1].props.children;
      const index = card.findIndex((child) => isValidElement(child) && child.type === FirstGoalForm);
      return { index, show: (card[index] as ReactElement<{ show: boolean }> | undefined)?.props.show };
    };
    cached.cachedGoals.mockResolvedValue([]);
    const empty = await slot();
    cached.cachedGoals.mockResolvedValue(GOALS);
    const withGoals = await slot();

    expect(empty.index).toBeGreaterThan(0);
    expect(empty).toEqual({ index: withGoals.index, show: true });
    expect(withGoals.show).toBe(false);
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

  it("長條圖與各項目累計依統計這一塊的寬度並排（容器查詢）：寬螢幕的記帳頁分成兩欄時，這一塊沒有螢幕那麼寬", async () => {
    const markup = await render(Statistics({ searchParams: params() }));

    expect(markup).toMatch(/^<div class="[^"]*@container[^"]*">/);
    expect(markup).toContain("@3xl:grid-cols-2");
    expect(markup).not.toMatch(/\b(?:md|lg|xl):grid-cols-2\b/);
  });

  it("月份標籤依長條圖本身的寬度決定要不要寫「月」：一欄太窄時只寫數字，不會擠成兩行", async () => {
    const markup = await render(Statistics({ searchParams: params() }));
    const labels = markup.slice(markup.indexOf('<ol aria-hidden="true"'));

    expect(markup).toMatch(/<div class="[^"]*@container[^"]*"><p[^>]*>最高/);
    expect(labels).toMatch(/<span class="@sm:hidden">\d{1,2}<\/span><span class="hidden @sm:inline">\d{1,2} 月<\/span>/);
    expect(labels).not.toMatch(/class="(?:sm:hidden|hidden sm:inline)"/);
  });
});
