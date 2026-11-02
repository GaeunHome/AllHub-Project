import { describe, expect, it } from "vitest";
import { averagePriceText, dividendDateText, periodLabel, plannedAmount } from "./format";

describe("periodLabel：月份的稱呼", () => {
  it("這個月是「本月」，同一年的其他月份只寫月，不同年加上年份", () => {
    expect(periodLabel("2026-10", "2026-10")).toBe("本月");
    expect(periodLabel("2026-09", "2026-10")).toBe("9 月");
    expect(periodLabel("2025-12", "2026-10")).toBe("2025 年 12 月");
  });
});

describe("averagePriceText：持股的均價", () => {
  it("總成本除以股數，到小數兩位（27,600 元買 120 股是 $230.00、1,000 元買 3 股是 $333.33）", () => {
    expect(averagePriceText({ shares: 120, cost: 27600 })).toBe("$230.00");
    expect(averagePriceText({ shares: 3, cost: 1000 })).toBe("$333.33");
  });

  it("賣光了（0 股）_沒有均價", () => {
    expect(averagePriceText({ shares: 0, cost: 0 })).toBeNull();
  });
});

describe("plannedAmount：固定收支的預計金額", () => {
  it("只有收入帶 +，支出與轉帳不帶符號", () => {
    expect(plannedAmount("income", 52000)).toBe("+$52,000");
    expect(plannedAmount("expense", 390)).toBe("$390");
    expect(plannedAmount("transfer", 5000)).toBe("$5,000");
  });
});

describe("dividendDateText：除權息那一列的日期", () => {
  it("寫除息日與還有幾天；今天、明天直接寫；除權、除權息照預告表的種類", () => {
    expect(dividendDateText({ exDate: "2026-11-18", kind: "cash", daysLeft: 20, lastBuyToday: false })).toBe("11/18 除息 · 還有 20 天");
    expect(dividendDateText({ exDate: "2026-10-29", kind: "cash", daysLeft: 0, lastBuyToday: false })).toBe("10/29 今天除息");
    expect(dividendDateText({ exDate: "2026-10-30", kind: "both", daysLeft: 1, lastBuyToday: false })).toBe("10/30 明天除權息");
    expect(dividendDateText({ exDate: "2026-11-06", kind: "stock", daysLeft: 8, lastBuyToday: false })).toBe("11/6 除權 · 還有 8 天");
  });

  it("今天是最後買進日_寫「今天最後買進」，不寫還有幾天（週一除息時週五就是最後買進日）", () => {
    expect(dividendDateText({ exDate: "2026-10-30", kind: "cash", daysLeft: 1, lastBuyToday: true })).toBe("10/30 除息 · 今天最後買進");
    expect(dividendDateText({ exDate: "2026-11-02", kind: "both", daysLeft: 3, lastBuyToday: true })).toBe("11/2 除權息 · 今天最後買進");
  });
});
