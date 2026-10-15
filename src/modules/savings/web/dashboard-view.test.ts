import { describe, expect, it } from "vitest";
import { expenseSlices, type AccountBalance, type CategoryMonthTotal } from "../lib/ledger";
import { activeAccountsInOrder, expenseRecords, periodLabel, salaryAccountOptions } from "./dashboard-view";

const CREATED = new Date("2026-01-05T02:00:00Z");
const account = (id: number, name: string, kind: "deposit" | "investment" | "credit", extra: Partial<{ active: boolean; sortOrder: number; monthlyPlan: number | null; targetAmount: number | null }> = {}) => ({
  id,
  userId: "u",
  name,
  kind,
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: id,
  createdAt: CREATED,
  ...extra,
});
const category = (id: number, name: string, kind: "expense" | "income", color: "blue" | "orange" | "green" = "blue") => ({ id, userId: "u", kind, name, color, monthlyBudget: null, sortOrder: id, createdAt: CREATED });

describe("月份的稱呼", () => {
  it("這個月是「本月」，同一年的其他月份只寫月，不同年加上年份", () => {
    expect(periodLabel("2026-10", "2026-10")).toBe("本月");
    expect(periodLabel("2026-09", "2026-10")).toBe("9 月");
    expect(periodLabel("2025-12", "2026-10")).toBe("2025 年 12 月");
  });
});

describe("交給表單的清單", () => {
  const ACCOUNTS = [account(3, "上海", "deposit", { sortOrder: 2 }), account(1, "國泰", "deposit", { sortOrder: 1 }), account(2, "舊帳戶", "deposit", { active: false }), account(4, "國泰信用卡", "credit", { sortOrder: 3 })];

  it("帳戶只有啟用中的，照設定頁的順序", () => {
    expect(activeAccountsInOrder(ACCOUNTS).map((a) => a.name)).toEqual(["國泰", "上海", "國泰信用卡"]);
  });

  it("發薪分配：啟用中的帳戶帶上目前的餘額、每月規劃、目標與順序；沒有紀錄的帳戶餘額是 0", () => {
    const balances = new Map<number, AccountBalance>([[1, { balance: 52000, cost: null, profit: null, owed: null }]]);
    const options = salaryAccountOptions([account(1, "國泰", "deposit"), account(5, "郵局", "deposit", { monthlyPlan: 2500, targetAmount: 10000, sortOrder: 4 }), account(2, "舊帳戶", "deposit", { active: false })], balances);

    expect(options).toEqual([
      { id: 1, name: "國泰", kind: "deposit", balance: 52000, monthlyPlan: null, targetAmount: null, sortOrder: 1 , payFromAccountId: null, startDate: "2026-01-05" },
      { id: 5, name: "郵局", kind: "deposit", balance: 0, monthlyPlan: 2500, targetAmount: 10000, sortOrder: 4 , payFromAccountId: null, startDate: "2026-01-05" },
    ]);
  });
});

describe("支出圓餅圖點下去的紀錄", () => {
  const CATEGORIES = [category(1, "餐飲", "expense"), category(2, "交通", "expense"), category(9, "薪水", "income")];
  const record = (id: number, kind: "expense" | "income" | "transfer", categoryId: number | null, amount: number) => ({
    id,
    userId: "u",
    kind,
    accountId: 1,
    counterAccountId: null,
    categoryId,
    amount,
    date: `2026-10-${String(id).padStart(2, "0")}`,
    note: id === 1 ? "午餐" : null,
    recurringId: null,
    createdAt: CREATED,
    accountName: "國泰",
    counterAccountName: null,
    categoryName: null,
    categoryColor: null,
    recurring: id === 3,
  });
  const TRANSACTIONS = [record(1, "expense", 1, 120), record(2, "expense", 2, 60), record(3, "expense", null, 300), record(4, "expense", 77, 40), record(5, "income", 9, 43000), record(6, "transfer", null, 2500)];

  it("只留支出；每一筆帶上它在圓餅圖裡那一片的 key（跟 expenseSlices 同一套規則：沒分類或分類已刪除都算未分類）", () => {
    const records = expenseRecords(TRANSACTIONS, CATEGORIES);
    const totals: CategoryMonthTotal[] = [
      { categoryId: 1, kind: "expense", month: "2026-10", amount: 120 },
      { categoryId: 2, kind: "expense", month: "2026-10", amount: 60 },
      { categoryId: null, kind: "expense", month: "2026-10", amount: 300 },
      { categoryId: 77, kind: "expense", month: "2026-10", amount: 40 },
    ];
    const sliceKeys = new Set(expenseSlices(CATEGORIES, totals, "2026-10").map((slice) => slice.key));

    expect(records.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(records.every((r) => sliceKeys.has(r.sliceKey))).toBe(true);
    expect(records.map((r) => r.sliceKey)).toEqual(["category:1", "category:2", "uncategorized", "uncategorized"]);
  });
});
