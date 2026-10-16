import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import type { SavingsAccount, SavingsHolding, SavingsRecurring } from "../../data/schema";
import type { CardDailyFlow } from "../../lib/cards";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedAccountFlows", "cachedCategoryTotals", "cachedCategories", "cachedRecurring", "cachedHoldings", "cachedQuotes", "cachedCardFlows", "cachedCardBills");
const { FinanceSnapshot } = await import("./home-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const html = async () => renderToStaticMarkup((await FinanceSnapshot()) as ReactElement);
const rowsOf = (markup: string) => [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [textOf(m[1]), textOf(m[2])]);
// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-01-05T02:00:00Z");

const account = (fixture: Pick<SavingsAccount, "id" | "name" | "kind"> & Partial<SavingsAccount>): SavingsAccount => ({
  userId: "u",
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: fixture.id,
  createdAt: CREATED,
  statementDay: null,
  autopay: false,
  cardNotifiedOn: null,
  ...fixture,
});
const holding: SavingsHolding = { id: 1, userId: "u", accountId: 3, symbol: "006208", name: "富邦台50", shares: 1000, cost: 95000, sortOrder: 0, createdAt: CREATED };
const rule: SavingsRecurring = {
  id: 1,
  userId: "u",
  kind: "expense",
  accountId: 1,
  counterAccountId: null,
  categoryId: null,
  amount: 1800,
  dayOfMonth: 8,
  note: null,
  active: true,
  lastPostedMonth: "2026-09-01",
  createdAt: CREATED,
  name: "電費",
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  mode: "confirm",
  holdingId: null,
  allocate: false,
  lastNotifiedOn: null,
};
const cardFlow = (date: string, expense: number): CardDailyFlow => ({ accountId: 4, date, income: 0, expense, transferIn: 0, transferOut: 0, adjust: 0 });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue([
    account({ id: 1, name: "國泰", kind: "deposit", openingBalance: 50000 }),
    account({ id: 2, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
    account({ id: 3, name: "臺銀證券", kind: "investment", openingBalance: 80000 }),
    account({ id: 4, name: "國泰卡", kind: "credit", statementDay: 5, dueDay: 20 }),
  ]);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([{ accountId: 4, month: "2026-09", income: 0, expense: 3000, transferIn: 0, transferOut: 0, adjust: 0 }]);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue([
    { categoryId: null, kind: "expense", month: "2026-10", amount: 12000 },
    { categoryId: null, kind: "expense", month: "2026-09", amount: 5000 },
  ]);
  cached.cachedCategories.mockReset().mockResolvedValue([]);
  cached.cachedRecurring.mockReset().mockResolvedValue([rule]);
  cached.cachedHoldings.mockReset().mockResolvedValue([holding]);
  cached.cachedQuotes.mockReset().mockResolvedValue([{ symbol: "006208", name: "富邦台50", closeCents: 10650, date: "2026-10-14", market: "twse" }]);
  cached.cachedCardFlows.mockReset().mockResolvedValue([cardFlow("2026-09-20", 3000)]);
  cached.cachedCardBills.mockReset().mockResolvedValue([]);
});

describe("首頁的理財卡片", () => {
  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    for (const fn of [cached.cachedAccounts, cached.cachedAccountFlows, cached.cachedCategoryTotals, cached.cachedRecurring, cached.cachedHoldings]) expect(fn).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCardFlows.mock.calls[0][0]).toBe(OTHER_SESSION.id);
    expect(cached.cachedCardBills).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("總資產含持股的市值（停用的帳戶與信用卡不算）、本月支出（上個月的不算）、待處理幾筆與最早那一筆的名稱和日期", async () => {
    // 50,000 + 1,000 股 × 106.50 電費 10/8 已過 國泰卡 10/20 截止
    expect(rowsOf(await html())).toEqual([
      ["總資產", "$156,500"],
      ["本月支出", "$12,000"],
      ["待處理", "2 筆 · 電費 10/8逾期 7 天"],
    ]);
  });

  it("沒有待處理_寫沒有", async () => {
    cached.cachedRecurring.mockResolvedValue([]);
    // 沒設截止日的卡不用填帳單也不用繳
    cached.cachedAccounts.mockResolvedValue([account({ id: 1, name: "國泰", kind: "deposit", openingBalance: 50000 }), account({ id: 4, name: "國泰卡", kind: "credit" })]);

    expect(rowsOf(await html())[2]).toEqual(["待處理", "沒有"]);
  });

  it("數字一出現就是最後的值，不從 0 往上數", async () => {
    expect(await html()).not.toMatch(/fin-count|fin-rise/);
  });

  it("還沒有帳戶_顯示開始使用的入口（到理財頁）", async () => {
    cached.cachedAccounts.mockResolvedValue([]);
    cached.cachedHoldings.mockResolvedValue([]);

    const markup = await html();

    expect(textOf(markup)).toContain("還沒有帳戶");
    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>(?:(?!<\/a>).)*開始使用/);
  });

});
