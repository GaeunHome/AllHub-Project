import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { TripExpense } from "../../../service/expenses";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"));
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
vi.mock("../../actions", () => ({ addExpenseAction: vi.fn(), deleteExpenseAction: vi.fn(), recordRepaymentAction: vi.fn(), settleTransferAction: vi.fn(), undoSettlementAction: vi.fn(), updateExpenseAction: vi.fn() }));

const { ExpensePanel } = await import("../expense-panel");
const { expenseBoard } = await import("../../expense-view");

const MEMBERS = [{ id: "a", username: "a", name: "小明", avatar: null }, { id: "b", username: "b", name: "小華", avatar: null }];
const EXPENSE: TripExpense = {
  id: 1,
  title: "晚餐",
  paidBy: "a",
  amountCents: 100000,
  currency: "TWD",
  rateMicros: 1000000,
  spentOn: "2026-12-01",
  category: "food",
  split: "even",
  payers: [{ userId: "a", amountCents: 100000 }],
  shares: [{ userId: "a", weight: null }, { userId: "b", weight: null }],
};
const TRIP = { title: "京都", startDate: "2026-12-01", endDate: "2026-12-03", settlements: [], members: MEMBERS, people: MEMBERS };
const panel = (expenses: TripExpense[]) => markup(createElement(ExpensePanel, { tripId: 1, userId: "b", members: MEMBERS, people: MEMBERS, board: expenseBoard({ ...TRIP, expenses }, "b") }));

describe("分帳平常收起來 收著也看得到自己要付多少", () => {
  it("打開頁面時是收著的 標題列寫要付多少", () => {
    const page = panel([EXPENSE]);

    expect(page).toMatch(/<details(?![^>]*\bopen\b)/);
    expect(textOf(page.match(/<summary.*?<\/summary>/)?.[0] ?? "")).toContain("你要付 $500");
  });

  it("還沒有帳：只有一個記一筆", () => {
    expect(textOf(panel([]))).toContain("還沒有帳");
    expect(panel([]).match(/記一筆/g)).toHaveLength(1);
  });
});
