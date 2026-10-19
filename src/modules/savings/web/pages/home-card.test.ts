import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import type { SavingsAccount, SavingsHolding } from "../../data/schema";
import { accountRow, checklistItem as item } from "../../dev/fixtures";
import type { ChecklistItem } from "../../lib/checklist";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });
vi.mock("../overview-data", { spy: true });

const cached = mocksOf(
  await import("../../service/cached"),
  "cachedAccounts",
  "cachedAccountFlows",
  "cachedCategoryTotals",
  "cachedCategories",
  "cachedRecurring",
  "cachedHoldings",
  "cachedQuotes",
  "cachedCardFlows",
  "cachedCardBills",
  "cachedRecurringRecords",
);
const { loadChecklist } = mocksOf(await import("../overview-data"), "loadChecklist");
const { FinanceSnapshot } = await import("./home-card");

const html = async () => markup(await FinanceSnapshot());
const rowsOf = (markup: string) => [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [textOf(m[1]), textOf(m[2])]);
// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-01-05T02:00:00Z");

const account = (values: Pick<SavingsAccount, "id" | "name" | "kind"> & Partial<SavingsAccount>) => accountRow({ createdAt: CREATED, ...values });
const holding: SavingsHolding = { id: 1, userId: "u", accountId: 3, symbol: "006208", name: "富邦台50", shares: 1000, cost: 95000, sortOrder: 0, createdAt: CREATED };
const checklistWith = async (items: ChecklistItem[]) => {
  const view = await loadChecklist(OTHER_SESSION.id, NOW);
  loadChecklist.mockResolvedValue({ ...view, items });
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  requireSession.mockReset();
  loadChecklist.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue([
    account({ id: 1, name: "國泰", kind: "deposit", openingBalance: 50000 }),
    account({ id: 3, name: "臺銀證券", kind: "investment", openingBalance: 80000 }),
    account({ id: 4, name: "國泰卡", kind: "credit", statementDay: 5 }),
  ]);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([{ accountId: 4, month: "2026-09", income: 0, expense: 3000, transferIn: 0, transferOut: 0, adjust: 0 }]);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue([
    { categoryId: null, kind: "expense", month: "2026-10", amount: 12000 },
    { categoryId: null, kind: "expense", month: "2026-09", amount: 5000 },
  ]);
  cached.cachedCategories.mockReset().mockResolvedValue([]);
  cached.cachedRecurring.mockReset().mockResolvedValue([]);
  cached.cachedHoldings.mockReset().mockResolvedValue([holding]);
  cached.cachedQuotes.mockReset().mockResolvedValue([{ symbol: "006208", name: "富邦台50", closeCents: 10650, date: "2026-10-14", market: "twse" }]);
  cached.cachedCardFlows.mockReset().mockResolvedValue([]);
  cached.cachedCardBills.mockReset().mockResolvedValue([]);
  cached.cachedRecurringRecords.mockReset().mockResolvedValue([]);
});

describe("首頁的理財卡片", () => {
  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    for (const fn of [cached.cachedAccounts, cached.cachedAccountFlows, cached.cachedCategoryTotals, cached.cachedRecurring, cached.cachedHoldings, cached.cachedCardBills, loadChecklist]) expect(fn.mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("總資產（跟總覽同一個算法）、本月支出（上個月的不算）、這個月還有幾件要做與最近一件的名稱和日期", async () => {
    // 照 loadChecklist 排好的順序
    await checklistWith([
      item({ key: "recurring:2:2026-10", title: "Netflix", date: "2026-10-02", state: "auto-done", doneOn: "2026-10-02" }),
      item({ key: "card:4:2026-10-05", title: "國泰卡", kind: "card", date: "2026-10-05", state: "todo", cardStage: "needs-bill" }),
      item({ key: "recurring:1:2026-10", title: "電費", date: "2026-10-08", state: "overdue" }),
    ]);

    // 50,000 + 1,000 股 × 106.50 做完的不算 最近一件是 10/5 的國泰卡
    expect(rowsOf(await html())).toEqual([
      ["總資產", "$156,500"],
      ["本月支出", "$12,000"],
      ["這個月", "還有 2 件要做 · 國泰卡 10/5"],
    ]);
  });

  it("最近一件是上個月沒做完而且逾期的（loadChecklist 排在最前面）_標逾期", async () => {
    await checklistWith([
      item({ key: "recurring:1:2026-09", title: "電費", date: "2026-09-20", state: "overdue", carriedOver: true }),
      item({ key: "card:4:2026-10-05", title: "國泰卡", kind: "card", date: "2026-10-05", state: "todo", cardStage: "needs-bill" }),
    ]);

    expect(rowsOf(await html())[2]).toEqual(["這個月", "還有 2 件要做 · 電費 9/20逾期 25 天"]);
  });

  it("都做完了_寫沒有要做的事", async () => {
    await checklistWith([item({ key: "recurring:2:2026-10", title: "Netflix", date: "2026-10-02", state: "auto-done", doneOn: "2026-10-02" })]);

    expect(rowsOf(await html())[2]).toEqual(["這個月", "沒有要做的事"]);
  });

  it("還沒有帳戶_顯示開始設定的入口（到理財頁）", async () => {
    cached.cachedAccounts.mockResolvedValue([]);
    cached.cachedHoldings.mockResolvedValue([]);

    const markup = await html();

    expect(textOf(markup)).toContain("還沒有帳戶");
    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>(?:(?!<\/a>).)*開始設定/);
  });
});
