import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { taipeiToday } from "../../lib/dates";
import { addMonths, taipeiMonth } from "../../lib/month";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 只看紀錄頁交給記帳按鈕的選項
vi.mock("../components/forms/quick-add", () => ({
  QuickAddButton: (p: { accounts: unknown[]; today: string }) => createElement("button", { "data-form": "quick-add", "data-accounts": JSON.stringify(p.accounts), "data-today": p.today }, "記一筆"),
  QuickAddFab: (p: { accounts: unknown[] }) => createElement("button", { "data-form": "quick-add-fab", "data-accounts": JSON.stringify(p.accounts) }, "＋"),
}));

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedCategories", "cachedAccountFlows", "cachedMonthTransactions");
const dialog = await import("@/core/ui/dialog");
const { RecordsPage, RecordsSection } = await import("./records-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: false };
// 固定在台北時間 2026-10-14 中午 午夜或月底跑測試時本月與今天才不會變
vi.useFakeTimers({ now: new Date("2026-10-14T04:00:00Z"), toFake: ["Date"] });
const MONTH = taipeiMonth(new Date());
const PREVIOUS = addMonths(MONTH, -1);
const CREATED = new Date("2025-01-05T02:00:00Z");

const account = (id: number, name: string, kind: "deposit" | "credit", active = true) => ({ id, userId: "u", name, kind, purposeId: null, openingBalance: 0, openingCost: null, monthlyPlan: null, targetAmount: null, dueDay: null, payFromAccountId: null, active, sortOrder: id, createdAt: CREATED });
const ACCOUNTS = [account(1, "國泰", "deposit"), { ...account(3, "國泰信用卡", "credit"), payFromAccountId: 1 }, account(8, "舊帳戶", "deposit", false)];
const CATEGORIES = [{ id: 11, userId: "u", kind: "expense", name: "餐飲", color: "orange", monthlyBudget: 6000, sortOrder: 1, createdAt: CREATED }];
const LUNCH = {
  id: 70,
  userId: "u",
  kind: "expense",
  accountId: 1,
  counterAccountId: null,
  categoryId: 11,
  amount: 120,
  date: `${MONTH}-01`,
  note: "午餐",
  recurringId: null,
  createdAt: CREATED,
  accountName: "國泰",
  counterAccountName: null,
  categoryName: "餐飲",
  categoryColor: "orange",
  recurring: false,
};

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const params = (month?: string, extra: Record<string, string | string[]> = {}) => Promise.resolve({ ...(month ? { month } : {}), ...extra });
const section = async (month?: string, extra?: Record<string, string | string[]>) => renderToStaticMarkup((await RecordsSection({ searchParams: params(month, extra) })) as ReactElement);
const categorySelected = (markup: string) => markup.match(/<select aria-label="分類"[^>]*>[\s\S]*?<\/select>/)?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1];
const attr = (markup: string, form: string, name: string) => markup.match(new RegExp(`<button data-form="${form}"[^>]*?${name}="([^"]*)"`))?.[1]?.replace(/&quot;/g, '"');

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([{ accountId: 1, month: PREVIOUS, income: 0, expense: 100, transferIn: 0, transferOut: 0, adjust: 0 }]);
  cached.cachedMonthTransactions.mockReset().mockResolvedValue([LUNCH]);
});

describe("理財的紀錄頁", () => {
  it("頁首（理財）與分頁列（紀錄是目前這一頁），紀錄串流進來前先出現骨架", () => {
    const markup = renderToStaticMarkup(createElement(RecordsPage, { info: INFO, searchParams: params() }));

    expect(markup).toMatch(/^<div data-accent="green" class="page-stack">/);
    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings\/records"|<a [^>]*href="\/savings\/records"[^>]*aria-current="page"/);
    expect(textOf(markup)).toContain("載入紀錄…");
  });

  it("整頁的視窗共用一個訊息範圍：只留最新的一則成功訊息", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(RecordsPage, { info: INFO, searchParams: params() }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });

  it("用登入者的 id 讀帳戶、分類、月份與那個月的紀錄", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await RecordsSection({ searchParams: params() });

    for (const fn of Object.values(cached)) expect(fn.mock.calls[0][0]).toBe(OTHER_SESSION.id);
    expect(cached.cachedMonthTransactions).toHaveBeenCalledWith(OTHER_SESSION.id, MONTH);
  });

  it("?month= 換月份；未來或格式不對的月份當成本月", async () => {
    await section(PREVIOUS);
    expect(cached.cachedMonthTransactions).toHaveBeenLastCalledWith(TEST_SESSION.id, PREVIOUS);

    await section(addMonths(MONTH, 1));
    expect(cached.cachedMonthTransactions).toHaveBeenLastCalledWith(TEST_SESSION.id, MONTH);
  });

  it("工具列：切換月份的連結都留在紀錄頁；記一筆與手機的＋只拿得到啟用中的帳戶（帶扣款帳戶與開始記帳的日期），日期上限是今天", async () => {
    const markup = await section();

    expect(markup).toContain(`href="/savings/records?month=${PREVIOUS}"`);
    expect(JSON.parse(attr(markup, "quick-add", "data-accounts") ?? "[]")).toEqual([
      { id: 1, name: "國泰", kind: "deposit", payFromAccountId: null, startDate: "2025-01-05" },
      { id: 3, name: "國泰信用卡", kind: "credit", payFromAccountId: 1, startDate: "2025-01-05" },
    ]);
    expect(attr(markup, "quick-add", "data-today")).toBe("2026-10-14");
    expect(taipeiToday(new Date())).toBe("2026-10-14");
    expect(markup).toContain('data-form="quick-add-fab"');
  });

  it("那個月的紀錄交給清單（名稱、帳戶、備註），篩選列出所有帳戶（停用的也在）", async () => {
    const markup = await section();

    expect(textOf(markup)).toContain("國泰 · 午餐");
    expect(markup).toContain("舊帳戶（已停用）");
  });

  it("還沒有任何帳戶_空狀態帶到設定頁並直接打開「新增帳戶」，沒有記帳按鈕", async () => {
    cached.cachedAccounts.mockResolvedValue([]);

    const markup = await section();

    expect(textOf(markup)).toContain("還沒有帳戶");
    expect(markup).toContain('href="/savings/settings?add=account#accounts"');
    expect(markup).not.toContain('data-form="quick-add');
  });

  describe("?category=：總覽點支出圓餅圖的一片連過來", () => {
    const UNSORTED = { ...LUNCH, id: 71, categoryId: null, categoryName: null, categoryColor: null, note: "高鐵票" };

    beforeEach(() => {
      cached.cachedMonthTransactions.mockResolvedValue([LUNCH, UNSORTED]);
    });

    it("自己的分類 id_一開始就篩選那個分類", async () => {
      const markup = await section(MONTH, { category: "11" });

      expect(categorySelected(markup)).toBe("餐飲");
      expect(textOf(markup)).not.toContain("高鐵票");
    });

    it("uncategorized_篩選未分類", async () => {
      const markup = await section(MONTH, { category: "uncategorized" });

      expect(categorySelected(markup)).toBe("未分類");
      expect(textOf(markup)).not.toContain("午餐");
    });

    it.each(["999", "abc", ""])("%j（別人的、不存在或認不得）_不篩選", async (category) => {
      const markup = await section(MONTH, { category });

      expect(categorySelected(markup)).toBe("分類");
      expect(textOf(markup)).toContain("午餐");
      expect(textOf(markup)).toContain("高鐵票");
    });
  });
});
