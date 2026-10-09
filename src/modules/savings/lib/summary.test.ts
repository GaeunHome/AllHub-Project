import { describe, expect, it } from "vitest";
import { earliestMonth, entryLabel, goalProgress, goalTotals, monthProgress, monthlySeries, percentOf, summarize, type MonthGoalTotal } from "./summary";

const goals = [
  { id: 1, name: "緊急預備金", monthlyAmount: 10000, active: true },
  { id: 2, name: "旅遊基金", monthlyAmount: 3000, active: true },
  { id: 3, name: "換車", monthlyAmount: 5000, active: false },
];

const totals: MonthGoalTotal[] = [
  { month: "2026-10", goalId: 1, goalName: "緊急預備金", amount: 10000 },
  { month: "2026-10", goalId: 2, goalName: "旅遊基金", amount: 1000 },
  { month: "2026-10", goalId: null, goalName: null, amount: 500 },
  { month: "2026-03", goalId: 1, goalName: "緊急預備金", amount: 10000 },
  { month: "2026-03", goalId: null, goalName: "舊項目", amount: 2000 },
  { month: "2025-12", goalId: 3, goalName: "換車", amount: 5000 },
];

describe("summarize（摘要卡片）", () => {
  it("本月預計只算啟用中項目_已存與累計含臨時存款和已刪除項目", () => {
    expect(summarize(goals, totals, "2026-10")).toEqual({
      planned: 13000,
      thisMonth: 11500,
      thisYear: 23500,
      allTime: 28500,
      activeGoals: 2,
      doneGoals: 1,
    });
  });

  it("今年累計不含去年_全部累計含", () => {
    const summary = summarize(goals, totals, "2026-01");
    expect(summary.thisMonth).toBe(0);
    expect(summary.thisYear).toBe(23500);
    expect(summary.allTime).toBe(28500);
  });

  it("臨時存款不算進項目的完成數", () => {
    const onlyTemporary: MonthGoalTotal[] = [{ month: "2026-10", goalId: null, goalName: null, amount: 99999 }];
    expect(summarize(goals, onlyTemporary, "2026-10")).toMatchObject({ thisMonth: 99999, doneGoals: 0 });
  });

  it("什麼都沒有_全部是 0", () => {
    expect(summarize([], [], "2026-10")).toEqual({ planned: 0, thisMonth: 0, thisYear: 0, allTime: 0, activeGoals: 0, doneGoals: 0 });
  });
});

describe("monthlySeries（每月總額長條圖）", () => {
  it("沒紀錄的月份補 0_同月多筆加總_最高的月份是 100%", () => {
    expect(monthlySeries(totals, ["2026-02", "2026-03", "2026-04", "2026-10"])).toEqual([
      { month: "2026-02", amount: 0, percent: 0 },
      { month: "2026-03", amount: 12000, percent: 100 },
      { month: "2026-04", amount: 0, percent: 0 },
      { month: "2026-10", amount: 11500, percent: 96 },
    ]);
  });

  it("金額很小的月份_至少留 2% 高度看得到", () => {
    const series = monthlySeries(
      [
        { month: "2026-09", goalId: null, goalName: null, amount: 1 },
        { month: "2026-10", goalId: null, goalName: null, amount: 100_000 },
      ],
      ["2026-09", "2026-10"],
    );
    expect(series.map((s) => s.percent)).toEqual([2, 100]);
  });

  it("全部是 0_高度都是 0_不會除以 0", () => {
    expect(monthlySeries([], ["2026-09", "2026-10"])).toEqual([
      { month: "2026-09", amount: 0, percent: 0 },
      { month: "2026-10", amount: 0, percent: 0 },
    ]);
  });
});

describe("goalTotals（各項目累計）", () => {
  it("依項目順序列出（含停用與還沒存過的）_接著已刪除的項目_最後是臨時存款", () => {
    const withUnused = [...goals, { id: 4, name: "保險", monthlyAmount: 2000, active: true }];
    expect(goalTotals(withUnused, totals)).toEqual([
      { key: "goal:1", label: "緊急預備金", tag: null, amount: 20000 },
      { key: "goal:2", label: "旅遊基金", tag: null, amount: 1000 },
      { key: "goal:3", label: "換車", tag: "已停用", amount: 5000 },
      { key: "goal:4", label: "保險", tag: null, amount: 0 },
      { key: "deleted:舊項目", label: "舊項目", tag: "已刪除", amount: 2000 },
      { key: "temporary", label: "臨時存款", tag: null, amount: 500 },
    ]);
  });

  it("同名的已刪除項目合併成一列", () => {
    const deletedTwice: MonthGoalTotal[] = [
      { month: "2026-01", goalId: null, goalName: "舊項目", amount: 100 },
      { month: "2026-02", goalId: null, goalName: "舊項目", amount: 200 },
    ];
    expect(goalTotals([], deletedTwice)).toEqual([{ key: "deleted:舊項目", label: "舊項目", tag: "已刪除", amount: 300 }]);
  });
});

describe("goalProgress（這個月每個項目存了沒）", () => {
  it("只列啟用中項目_同項目多筆加總_判斷沒存／存一部分／已存_還差多少不會是負的", () => {
    const withUnused = [...goals, { id: 4, name: "保險", monthlyAmount: 2000, active: true }];
    const entries = [
      { goalId: 1, amount: 6000 },
      { goalId: 1, amount: 5000 },
      { goalId: 2, amount: 1000 },
      { goalId: null, amount: 500 },
      { goalId: 3, amount: 5000 },
    ];

    const progress = goalProgress(withUnused, entries).map(({ goal, ...rest }) => ({ id: goal.id, ...rest }));

    expect(progress).toEqual([
      { id: 1, saved: 11000, remaining: 0, status: "done" },
      { id: 2, saved: 1000, remaining: 2000, status: "partial" },
      { id: 4, saved: 0, remaining: 2000, status: "pending" },
    ]);
  });
});

describe("entryLabel（紀錄的項目名稱）", () => {
  it("還在的項目_用名稱", () => {
    expect(entryLabel({ goalId: 1, goalName: "旅遊基金" })).toEqual({ label: "旅遊基金", tag: null });
  });

  it("項目已刪除_用名稱快照並標示已刪除", () => {
    expect(entryLabel({ goalId: null, goalName: "換車" })).toEqual({ label: "換車", tag: "已刪除" });
  });

  it("臨時存款", () => {
    expect(entryLabel({ goalId: null, goalName: null })).toEqual({ label: "臨時存款", tag: null });
  });
});

describe("percentOf（本月達成率）", () => {
  it.each([
    [1500, 3000, 50],
    [1000, 3000, 33],
    [2000, 3000, 67],
    [3450, 3000, 115],
    [0, 3000, 0],
  ])("%i／%i_是 %i%", (part, whole, expected) => {
    expect(percentOf(part, whole)).toBe(expected);
  });

  it("沒有預計金額_沒有達成率", () => {
    expect(percentOf(500, 0)).toBeNull();
  });
});

describe("earliestMonth", () => {
  it("回傳最早有紀錄的月份", () => {
    expect(earliestMonth(totals)).toBe("2025-12");
  });

  it("沒有紀錄_回 null", () => {
    expect(earliestMonth([])).toBeNull();
  });
});

describe("monthProgress（首頁卡片與記帳頁總覽共用的月進度）", () => {
  it("已存含臨時存款_應存只算啟用中項目_還差是各項目沒存滿的部分", () => {
    const progress = monthProgress(goals, totals, "2026-10");

    expect(progress).toMatchObject({ planned: 13000, saved: 11500, percent: 88, remaining: 2000, doneGoals: 1 });
    expect(progress.goals.map(({ goal, saved, remaining, status }) => ({ id: goal.id, saved, remaining, status }))).toEqual([
      { id: 1, saved: 10000, remaining: 0, status: "done" },
      { id: 2, saved: 1000, remaining: 2000, status: "partial" },
    ]);
  });

  it("切換到過去的月份_只算那個月的紀錄（已刪除項目的錢算進已存，不抵任何項目）", () => {
    expect(monthProgress(goals, totals, "2026-03")).toMatchObject({ planned: 13000, saved: 12000, percent: 92, remaining: 3000, doneGoals: 1 });
  });

  it("臨時存款再多也不抵項目的還差_達成率可以超過 100", () => {
    const onlyTemporary: MonthGoalTotal[] = [{ month: "2026-10", goalId: null, goalName: null, amount: 26000 }];

    expect(monthProgress(goals, onlyTemporary, "2026-10")).toMatchObject({ saved: 26000, percent: 200, remaining: 13000, doneGoals: 0 });
  });

  it("全部存滿_還差 0", () => {
    const filled: MonthGoalTotal[] = [
      { month: "2026-10", goalId: 1, goalName: "緊急預備金", amount: 10000 },
      { month: "2026-10", goalId: 2, goalName: "旅遊基金", amount: 3500 },
    ];

    expect(monthProgress(goals, filled, "2026-10")).toMatchObject({ remaining: 0, doneGoals: 2, percent: 104 });
  });

  it("沒有項目_應存 0、沒有達成率", () => {
    expect(monthProgress([], [], "2026-10")).toEqual({ planned: 0, saved: 0, percent: null, remaining: 0, doneGoals: 0, goals: [] });
  });
});
