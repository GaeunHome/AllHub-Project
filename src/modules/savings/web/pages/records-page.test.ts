import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { taipeiMonthKey } from "@/core/time";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { markup as render, mocksOf, textOf } from "@/dev/test-helpers";
import { accountRow } from "../../dev/fixtures";
import { taipeiToday } from "../../lib/dates";
import { addMonths } from "../../lib/month";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 刪除鈕在 ⋮ 選單裡 選單關著時不算繪 換掉才看得到每一筆的確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
// 只看紀錄頁交給記帳按鈕的選項
vi.mock("../components/forms/quick-add", () => ({
  QuickAddButton: (p: { accounts: unknown[]; today: string }) => createElement("button", { "data-form": "quick-add", "data-accounts": JSON.stringify(p.accounts), "data-today": p.today }, "記一筆"),
}));

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedCategories", "cachedAccountFlows", "cachedMonthTransactions", "cachedCategoryTotals", "cachedRecurring", "cachedHoldings");
const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const { RecordsPage, RecordsSection, RecordsActions } = await import("./records-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: true };
// 固定在台北時間 2026-10-14 中午 午夜或月底跑測試時本月與今天才不會變
vi.useFakeTimers({ now: new Date("2026-10-14T04:00:00Z"), toFake: ["Date"] });
const MONTH = taipeiMonthKey(new Date());
const PREVIOUS = addMonths(MONTH, -1);
const CREATED = new Date("2025-01-05T02:00:00Z");

const ACCOUNTS = [
  accountRow({ id: 1, name: "國泰", kind: "deposit", createdAt: CREATED }),
  accountRow({ id: 3, name: "國泰信用卡", kind: "credit", payFromAccountId: 1, createdAt: CREATED }),
  accountRow({ id: 8, name: "舊帳戶", kind: "deposit", active: false, createdAt: CREATED }),
];
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
  holdingId: null,
  shares: null,
  costChange: null,
  recurringPeriod: null,
  createdAt: CREATED,
  accountName: "國泰",
  counterAccountName: null,
  categoryName: "餐飲",
  recurring: false,
  recurringName: null,
  holdingSymbol: null,
};

const params = (month?: string, extra: Record<string, string | string[]> = {}) => Promise.resolve({ ...(month ? { month } : {}), ...extra });
const section = async (month?: string, extra?: Record<string, string | string[]>) => render(await RecordsSection({ searchParams: params(month, extra) }));
const selectedIn = (markup: string, label: string) => markup.match(new RegExp(`<select aria-label="${label}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1];
const attr = (markup: string, form: string, name: string) => markup.match(new RegExp(`<button data-form="${form}"[^>]*?${name}="([^"]*)"`))?.[1]?.replace(/&quot;/g, '"');

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([{ accountId: 1, month: PREVIOUS, income: 0, expense: 100, transferIn: 0, transferOut: 0, adjust: 0 }]);
  cached.cachedMonthTransactions.mockReset().mockResolvedValue([LUNCH]);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue([]);
  cached.cachedRecurring.mockReset().mockResolvedValue([]);
  cached.cachedHoldings.mockReset().mockResolvedValue([]);
  vi.mocked(ActionButton).mockClear();
});

describe("理財的紀錄頁", () => {
  it("紀錄串流進來前先出現骨架", () => {
    expect(textOf(render(createElement(RecordsPage, { info: INFO, searchParams: params() })))).toContain("載入紀錄…");
  });

  it("整頁的視窗共用一個訊息範圍：只留最新的一則成功訊息", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    render(createElement(RecordsPage, { info: INFO, searchParams: params() }));

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

  it("工具列的月份切換：連結都留在紀錄頁", async () => {
    expect(await section()).toContain(`href="/savings/records?month=${PREVIOUS}"`);
  });

  it("頁首的記一筆（手機也用這一顆）：只拿得到啟用中的帳戶（帶扣款帳戶與開始記帳的日期），日期上限是今天；用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    const markup = render(await RecordsActions());

    expect(JSON.parse(attr(markup, "quick-add", "data-accounts") ?? "[]")).toEqual([
      { id: 1, name: "國泰", kind: "deposit", payFromAccountId: null, startDate: "2025-01-05", withHoldings: false },
      { id: 3, name: "國泰信用卡", kind: "credit", payFromAccountId: 1, startDate: "2025-01-05", withHoldings: false },
    ]);
    expect(attr(markup, "quick-add", "data-today")).toBe("2026-10-14");
    expect(taipeiToday(new Date())).toBe("2026-10-14");
    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCategories).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("頁首的記一筆：有持股的投資帳戶標出來，轉帳的選單才不列它（要用買進賣出）", async () => {
    cached.cachedAccounts.mockResolvedValue([...ACCOUNTS, accountRow({ id: 4, name: "臺銀證券", kind: "investment", createdAt: CREATED })]);
    cached.cachedHoldings.mockResolvedValue([{ id: 9, userId: "u", accountId: 4, symbol: "006208", name: "富邦台50", shares: 10, cost: 2500, sortOrder: 0, createdAt: CREATED }]);
    const markup = render(await RecordsActions());
    const accounts = JSON.parse(attr(markup, "quick-add", "data-accounts") ?? "[]") as { id: number; withHoldings: boolean }[];

    expect(accounts.filter((item) => item.withHoldings).map((item) => item.id)).toEqual([4]);
  });

  it("沒有右下角的浮動加號，記一筆只在頁首", async () => {
    const markup = await section();

    expect(markup).not.toContain('data-form="quick-add');
    expect(markup).not.toMatch(/class="[^"]*\bfixed\b/);
  });

  it("那個月的紀錄交給清單（名稱、帳戶、備註），篩選列出所有帳戶（停用的也在）", async () => {
    const markup = await section();

    expect(textOf(markup)).toContain("國泰 · 午餐");
    expect(markup).toContain("舊帳戶（已停用）");
  });

  it("還沒有任何帳戶_一行字加連到帳戶頁並直接打開「新增銀行帳戶」的連結", async () => {
    cached.cachedAccounts.mockResolvedValue([]);

    const markup = await section();

    expect(textOf(markup)).toContain("還沒有帳戶");
    expect(markup).toContain('href="/savings/accounts?add=deposit"');
  });

  describe("從待處理確認來的紀錄：刪掉後那一期會不會回到待處理（跟伺服器同一個條件）", () => {
    const rule = (id: number, mode: "confirm" | "auto", lastPostedMonth: string, kind = "expense") => ({ id, kind, mode, lastPostedMonth });
    const confirmed = (id: number, recurringId: number, recurringPeriod: string | null, kind = "expense") => ({ ...LUNCH, id, kind, recurringId, recurringPeriod, recurring: true, recurringName: "電費", note: `電費 ${id}` });
    const confirmOf = (id: number) => vi.mocked(ActionButton).mock.calls.map(([props]) => props).find((props) => props.fields.id === id)?.confirmMessage ?? "";

    it("規則還是要確認、而且處理到的就是這一期_會回到待處理；處理到更後面的、自動記的、沒有期別的_不會", async () => {
      cached.cachedRecurring.mockResolvedValue([rule(1, "confirm", `${MONTH}-01`), rule(2, "confirm", `${addMonths(MONTH, 1)}-01`), rule(3, "auto", `${MONTH}-01`)] as never);
      cached.cachedMonthTransactions.mockResolvedValue([confirmed(81, 1, `${MONTH}-01`), confirmed(82, 2, `${MONTH}-01`), confirmed(83, 3, `${MONTH}-01`), confirmed(84, 1, null)]);

      await section();

      expect(confirmOf(81)).toContain("回到總覽的「這個月要做的事」");
      for (const id of [82, 83, 84]) expect(confirmOf(id)).not.toContain("這個月要做的事");
    });

    it("薪水分出去的轉帳也標了這一期_刪掉它不會（伺服器只在刪掉入帳的那筆收入時退回）", async () => {
      cached.cachedRecurring.mockResolvedValue([rule(5, "confirm", `${MONTH}-01`, "income")] as never);
      cached.cachedMonthTransactions.mockResolvedValue([confirmed(91, 5, `${MONTH}-01`, "income"), { ...confirmed(92, 5, `${MONTH}-01`, "transfer"), categoryId: null, categoryName: null, counterAccountId: 8, counterAccountName: "舊帳戶" }]);

      await section();

      expect(confirmOf(91)).toContain("回到總覽的「這個月要做的事」");
      expect(confirmOf(92)).not.toContain("這個月要做的事");
    });
  });

  describe("?account=：帳戶頁的卡片連過來", () => {
    const CARD_SPEND = { ...LUNCH, id: 72, accountId: 3, accountName: "國泰信用卡", note: "晚餐" };

    beforeEach(() => {
      cached.cachedMonthTransactions.mockResolvedValue([LUNCH, CARD_SPEND]);
    });

    it("自己的帳戶 id_一開始就篩選那個帳戶", async () => {
      const markup = await section(MONTH, { account: "3" });

      expect(selectedIn(markup, "帳戶")).toBe("國泰信用卡");
      expect(textOf(markup)).not.toContain("午餐");
    });

    it.each(["999", "abc", ""])("%j（別人的、不存在或認不得）_不篩選", async (raw) => {
      const markup = await section(MONTH, { account: raw });

      expect(selectedIn(markup, "帳戶")).toBe("帳戶");
      expect(textOf(markup)).toContain("午餐");
      expect(textOf(markup)).toContain("晚餐");
    });
  });

  describe("?category=：總覽點本月支出的一個分類連過來", () => {
    const UNSORTED = { ...LUNCH, id: 71, categoryId: null, categoryName: null, note: "高鐵票" };

    beforeEach(() => {
      cached.cachedMonthTransactions.mockResolvedValue([LUNCH, UNSORTED]);
    });

    it("自己的分類 id_一開始就篩選那個分類", async () => {
      const markup = await section(MONTH, { category: "11" });

      expect(selectedIn(markup, "分類")).toBe("餐飲");
      expect(textOf(markup)).not.toContain("高鐵票");
    });

    it("uncategorized_篩選未分類", async () => {
      const markup = await section(MONTH, { category: "uncategorized" });

      expect(selectedIn(markup, "分類")).toBe("未分類");
      expect(textOf(markup)).not.toContain("午餐");
    });

    it.each(["999", "abc", ""])("%j（別人的、不存在或認不得）_不篩選", async (category) => {
      const markup = await section(MONTH, { category });

      expect(selectedIn(markup, "分類")).toBe("分類");
      expect(textOf(markup)).toContain("午餐");
      expect(textOf(markup)).toContain("高鐵票");
    });
  });
});
