import { describe, expect, it } from "vitest";
import type { CategoryMonthTotal } from "../../lib/ledger";
import { expenseRows } from "../expense-rows";

describe("本月支出", () => {
  const category = (id: number, name: string, monthlyBudget: number | null) => ({ id, name, kind: "expense" as const, monthlyBudget });
  const CATEGORIES = [category(1, "餐飲", 10000), category(2, "交通", null), category(3, "訂閱", 500), category(4, "娛樂", 3000)];
  const total = (categoryId: number | null, amount: number): CategoryMonthTotal => ({ categoryId, kind: "expense", month: "2026-10", amount });
  const rows = expenseRows(CATEGORIES, [total(1, 8200), total(2, 1900), total(3, 650), total(null, 1250)], "2026-10");

  it("照金額由大到小，沒分類的併成「未分類」；有預算但這個月還沒花的排在最後", () => {
    expect(rows.map((row) => [row.name, row.spent])).toEqual([
      ["餐飲", 8200],
      ["交通", 1900],
      ["未分類", 1250],
      ["訂閱", 650],
      ["娛樂", 0],
    ]);
  });

  it("長條只畫有預算的，是已用 / 預算（超過畫滿），只有超支才寫超過多少；沒預算的只寫金額", () => {
    const [food, transport, , subscription] = rows;

    expect(food).toMatchObject({ budget: 10000, barPercent: 82, over: 0 });
    expect(subscription).toMatchObject({ budget: 500, barPercent: 100, over: 150 });
    expect(transport).toMatchObject({ budget: null, barPercent: null, over: 0 });
  });

  it("點一列到紀錄頁篩好那個分類（未分類用 uncategorized）", () => {
    expect(rows[0].href).toBe("/savings/records?category=1");
    expect(rows[2].href).toBe("/savings/records?category=uncategorized");
  });
});
