import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { savingsEntries, savingsGoals } from "../data/schema";
import { summarize } from "../lib/summary";
import {
  SavingsUserError,
  addEntry,
  createGoal,
  deleteEntry,
  deleteGoal,
  entryTotals,
  listGoals,
  listMonthEntries,
  moveGoal,
  setGoalActive,
  updateGoal,
} from "./savings";

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

// 台北時間 2026-10-07 中午
const NOW = new Date("2026-10-07T04:00:00Z");

/** 沒指定擁有者就是 me 的 */
async function insertGoal(values: { name: string; monthlyAmount?: number; sortOrder?: number; active?: boolean; userId?: string | null }) {
  const [goal] = await getDb().insert(savingsGoals).values({ monthlyAmount: 5000, userId: me, ...values }).returning();
  return goal;
}

async function insertEntry(values: { month: string; amount: number; goalId?: number | null; goalName?: string | null; note?: string | null; userId?: string | null }) {
  const [entry] = await getDb().insert(savingsEntries).values({ userId: me, ...values }).returning();
  return entry;
}

const goalRows = () => getDb().select().from(savingsGoals).orderBy(asc(savingsGoals.id));
const entryRows = () => getDb().select().from(savingsEntries).orderBy(asc(savingsEntries.id));
const goalNamesInOrder = async () => (await getDb().select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder))).map((g) => g.name);

/** drizzle 把資料庫錯誤包在 cause 裡；回傳錯誤文字，確認是被哪個約束擋下 */
async function failureOf(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    return String((error as { cause?: unknown }).cause ?? error);
  }
  return "（沒有錯誤）";
}

describe("createGoal（PGlite 整合）", () => {
  it("去掉空白後寫入_預設啟用_排在現有項目後面", async () => {
    await insertGoal({ name: "既有項目", sortOrder: 4 });

    const goal = await createGoal(me, { name: "  旅遊基金 ", monthlyAmount: "3,000", note: " 日本 " });

    const [, row] = await goalRows();
    expect(row).toMatchObject({ id: goal.id, name: "旅遊基金", monthlyAmount: 3000, note: "日本", active: true, sortOrder: 5 });
  });

  it("第一個項目_排序從 0 開始_空備註存 null", async () => {
    await createGoal(me, { name: "緊急預備金", monthlyAmount: "10000", note: "" });

    const [row] = await goalRows();
    expect(row).toMatchObject({ sortOrder: 0, note: null });
  });

  it("金額是負數_丟使用者錯誤_資料庫沒有新項目", async () => {
    await expect(createGoal(me, { name: "旅遊基金", monthlyAmount: "-3000", note: "" })).rejects.toThrow(SavingsUserError);
    expect(await goalRows()).toHaveLength(0);
  });
});

describe("listGoals（PGlite 整合）", () => {
  it("依排序值_同排序值再依建立順序", async () => {
    await insertGoal({ name: "C", sortOrder: 2 });
    await insertGoal({ name: "A", sortOrder: 0 });
    await insertGoal({ name: "B1", sortOrder: 1 });
    await insertGoal({ name: "B2", sortOrder: 1 });

    expect((await listGoals(me)).map((g) => g.name)).toEqual(["A", "B1", "B2", "C"]);
  });
});

describe("updateGoal（PGlite 整合）", () => {
  it("改名稱與金額_這個項目的紀錄名稱快照一起更新_其他紀錄不動", async () => {
    const goal = await insertGoal({ name: "旅遊" });
    const other = await insertGoal({ name: "保險" });
    await insertEntry({ month: "2026-09-01", amount: 5000, goalId: goal.id, goalName: "旅遊" });
    await insertEntry({ month: "2026-09-01", amount: 2000, goalId: other.id, goalName: "保險" });

    await updateGoal(me, goal.id, { name: "日本旅遊", monthlyAmount: "6000", note: "明年春天" });

    const [updated] = await goalRows();
    expect(updated).toMatchObject({ name: "日本旅遊", monthlyAmount: 6000, note: "明年春天" });
    expect((await entryRows()).map((e) => e.goalName)).toEqual(["日本旅遊", "保險"]);
  });

  it("項目不存在_丟使用者錯誤", async () => {
    await expect(updateGoal(me, 999, { name: "旅遊", monthlyAmount: "1000", note: "" })).rejects.toThrow(SavingsUserError);
  });

  it("輸入不合法_丟使用者錯誤_資料不變", async () => {
    const goal = await insertGoal({ name: "旅遊", monthlyAmount: 5000 });

    await expect(updateGoal(me, goal.id, { name: "", monthlyAmount: "1000", note: "" })).rejects.toThrow("請輸入項目名稱");

    const [row] = await goalRows();
    expect(row).toMatchObject({ name: "旅遊", monthlyAmount: 5000 });
  });
});

describe("setGoalActive（PGlite 整合）", () => {
  it("停用後再啟用", async () => {
    const goal = await insertGoal({ name: "旅遊" });

    await setGoalActive(me, goal.id, false);
    expect((await goalRows())[0].active).toBe(false);

    await setGoalActive(me, goal.id, true);
    expect((await goalRows())[0].active).toBe(true);
  });

  it("項目不存在_丟使用者錯誤", async () => {
    await expect(setGoalActive(me, 999, false)).rejects.toThrow(SavingsUserError);
  });
});

describe("moveGoal（PGlite 整合）", () => {
  it("往上移_跟前一個交換", async () => {
    await insertGoal({ name: "A", sortOrder: 0 });
    await insertGoal({ name: "B", sortOrder: 1 });
    const c = await insertGoal({ name: "C", sortOrder: 2 });

    await moveGoal(me, c.id, "up");

    expect(await goalNamesInOrder()).toEqual(["A", "C", "B"]);
  });

  it("排序值都一樣時_依畫面上的順序移動_並重新編號", async () => {
    const a = await insertGoal({ name: "A", sortOrder: 0 });
    await insertGoal({ name: "B", sortOrder: 0 });
    await insertGoal({ name: "C", sortOrder: 0 });

    await moveGoal(me, a.id, "down");

    const rows = await getDb().select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder));
    expect(rows.map((g) => [g.name, g.sortOrder])).toEqual([["B", 0], ["A", 1], ["C", 2]]);
  });

  it("已經在最上面再往上_順序不變", async () => {
    const a = await insertGoal({ name: "A", sortOrder: 0 });
    await insertGoal({ name: "B", sortOrder: 1 });

    await moveGoal(me, a.id, "up");

    expect(await goalNamesInOrder()).toEqual(["A", "B"]);
  });
});

describe("deleteGoal（PGlite 整合）", () => {
  it("刪除項目_紀錄全部保留_項目欄位變 null_名稱快照還在", async () => {
    const goal = await insertGoal({ name: "換車" });
    const other = await insertGoal({ name: "保險" });
    await insertEntry({ month: "2026-09-01", amount: 5000, goalId: goal.id, goalName: "換車" });
    await insertEntry({ month: "2026-10-01", amount: 5000, goalId: goal.id, goalName: "換車" });
    await insertEntry({ month: "2026-10-01", amount: 2000, goalId: other.id, goalName: "保險" });

    await deleteGoal(me, goal.id);

    expect((await goalRows()).map((g) => g.name)).toEqual(["保險"]);
    expect((await entryRows()).map((e) => [e.goalId, e.goalName, e.amount])).toEqual([
      [null, "換車", 5000],
      [null, "換車", 5000],
      [other.id, "保險", 2000],
    ]);
  });
});

describe("addEntry（PGlite 整合）", () => {
  it("記錄項目_月份存成當月 1 號_帶項目名稱快照", async () => {
    const goal = await insertGoal({ name: "緊急預備金", monthlyAmount: 10000 });

    await addEntry(me, { goalId: goal.id, month: "2026-10", amount: "10000", note: "" }, NOW);

    const [entry] = await entryRows();
    expect(entry).toMatchObject({ month: "2026-10-01", goalId: goal.id, goalName: "緊急預備金", amount: 10000, note: null });
  });

  it("臨時存款_沒有項目也沒有名稱快照_保留備註", async () => {
    await addEntry(me, { goalId: null, month: "2026-09", amount: "3000", note: "發票中獎" }, NOW);

    const [entry] = await entryRows();
    expect(entry).toMatchObject({ month: "2026-09-01", goalId: null, goalName: null, amount: 3000, note: "發票中獎" });
  });

  it("項目不存在_丟使用者錯誤_不寫入", async () => {
    await expect(addEntry(me, { goalId: 999, month: "2026-10", amount: "1000", note: "" }, NOW)).rejects.toThrow(SavingsUserError);
    expect(await entryRows()).toHaveLength(0);
  });

  it("未來的月份_丟使用者錯誤_不寫入", async () => {
    await expect(addEntry(me, { goalId: null, month: "2026-11", amount: "1000", note: "" }, NOW)).rejects.toThrow("不能記錄未來的月份");
    expect(await entryRows()).toHaveLength(0);
  });

  it("台北已經是 11 月（UTC 還在 10/31）_可以記錄 11 月", async () => {
    const taipeiNovemberFirst = new Date("2026-10-31T16:30:00Z");

    await addEntry(me, { goalId: null, month: "2026-11", amount: "1000", note: "" }, taipeiNovemberFirst);

    expect((await entryRows())[0].month).toBe("2026-11-01");
  });

  it("金額有小數_丟使用者錯誤_不寫入", async () => {
    await expect(addEntry(me, { goalId: null, month: "2026-10", amount: "99.5", note: "" }, NOW)).rejects.toThrow(SavingsUserError);
    expect(await entryRows()).toHaveLength(0);
  });
});

describe("deleteEntry（PGlite 整合）", () => {
  it("只刪掉指定的那一筆", async () => {
    const first = await insertEntry({ month: "2026-10-01", amount: 100 });
    await insertEntry({ month: "2026-10-01", amount: 200 });

    await deleteEntry(me, first.id);

    expect((await entryRows()).map((e) => e.amount)).toEqual([200]);
  });
});

describe("listMonthEntries（PGlite 整合）", () => {
  it("只回傳該月份_依記錄先後排序", async () => {
    await insertEntry({ month: "2026-10-01", amount: 100 });
    await insertEntry({ month: "2026-09-01", amount: 200 });
    await insertEntry({ month: "2026-10-01", amount: 300 });

    expect((await listMonthEntries(me, "2026-10")).map((e) => e.amount)).toEqual([100, 300]);
  });
});

describe("entryTotals（PGlite 整合）", () => {
  it("依月份與項目加總_已刪除項目與臨時存款分開_月份是 YYYY-MM", async () => {
    const goal = await insertGoal({ name: "A" });
    await insertEntry({ month: "2026-10-01", amount: 1000, goalId: goal.id, goalName: "A" });
    await insertEntry({ month: "2026-10-01", amount: 2000, goalId: goal.id, goalName: "A" });
    await insertEntry({ month: "2026-10-01", amount: 500 });
    await insertEntry({ month: "2026-09-01", amount: 700, goalName: "舊項目" });

    const totals = await entryTotals(me);

    expect(totals).toHaveLength(3);
    expect(totals).toEqual(
      expect.arrayContaining([
        { month: "2026-10", goalId: goal.id, goalName: "A", amount: 3000 },
        { month: "2026-10", goalId: null, goalName: null, amount: 500 },
        { month: "2026-09", goalId: null, goalName: "舊項目", amount: 700 },
      ]),
    );
  });

  it("加總超過 int 上限（約 21 億）_仍是正確的數字", async () => {
    await getDb()
      .insert(savingsEntries)
      .values(Array.from({ length: 30 }, () => ({ userId: me, month: "2026-10-01", amount: 100_000_000 })));

    expect(await entryTotals(me)).toEqual([{ month: "2026-10", goalId: null, goalName: null, amount: 3_000_000_000 }]);
  });
});

describe("資料庫約束（PGlite 整合）", () => {
  it("負數、0 或超過 1 億的金額_寫不進資料庫", async () => {
    for (const amount of [-1, 0, 100_000_001]) {
      expect(await failureOf(getDb().insert(savingsEntries).values({ month: "2026-10-01", amount }).execute())).toContain("savings_entries_amount_range");
      expect(await failureOf(getDb().insert(savingsGoals).values({ name: "x", monthlyAmount: amount }).execute())).toContain(
        "savings_goals_monthly_amount_range",
      );
    }
  });

  it("月份不是 1 號_寫不進資料庫", async () => {
    expect(await failureOf(getDb().insert(savingsEntries).values({ month: "2026-10-15", amount: 100 }).execute())).toContain(
      "savings_entries_month_first_day",
    );
  });

  it("有項目卻沒有名稱快照_寫不進資料庫", async () => {
    const goal = await insertGoal({ name: "A" });

    expect(await failureOf(getDb().insert(savingsEntries).values({ month: "2026-10-01", amount: 100, goalId: goal.id }).execute())).toContain(
      "savings_entries_goal_name_snapshot",
    );
  });
});

describe("記帳流程（PGlite 整合）", () => {
  it("新增項目→記錄本月→臨時存款→看摘要→刪除項目後累計仍在", async () => {
    const goal = await createGoal(me, { name: "旅遊基金", monthlyAmount: "3000", note: "" });
    await addEntry(me, { goalId: goal.id, month: "2026-09", amount: "3000", note: "" }, NOW);
    await addEntry(me, { goalId: goal.id, month: "2026-10", amount: "3000", note: "" }, NOW);
    await addEntry(me, { goalId: null, month: "2026-10", amount: "500", note: "發票中獎" }, NOW);

    expect(summarize(await listGoals(me), await entryTotals(me), "2026-10")).toEqual({
      planned: 3000,
      thisMonth: 3500,
      thisYear: 6500,
      allTime: 6500,
      activeGoals: 1,
      doneGoals: 1,
    });
    expect((await listMonthEntries(me, "2026-10")).map((e) => [e.goalName, e.amount, e.note])).toEqual([
      ["旅遊基金", 3000, null],
      [null, 500, "發票中獎"],
    ]);

    await deleteGoal(me, goal.id);

    expect(summarize(await listGoals(me), await entryTotals(me), "2026-10")).toEqual({
      planned: 0,
      thisMonth: 3500,
      thisYear: 6500,
      allTime: 6500,
      activeGoals: 0,
      doneGoals: 0,
    });
  });
});

describe("每個人只看得到、改得到自己的記帳", () => {
  it("清單、月份紀錄與累計只有自己的：別人的與 user_id 是 null 的（舊程式在空窗期寫入）都不算", async () => {
    await insertGoal({ name: "我的項目" });
    await insertGoal({ name: "別人的項目", userId: other });
    await insertGoal({ name: "沒有擁有者", userId: null });
    await insertEntry({ month: "2026-10-01", amount: 100 });
    await insertEntry({ month: "2026-10-01", amount: 200, userId: other });
    await insertEntry({ month: "2026-10-01", amount: 300, userId: null });

    expect((await listGoals(me)).map((g) => g.name)).toEqual(["我的項目"]);
    expect((await listMonthEntries(me, "2026-10")).map((e) => e.amount)).toEqual([100]);
    expect((await entryTotals(me)).map((t) => t.amount)).toEqual([100]);
    expect((await listGoals(other)).map((g) => g.name)).toEqual(["別人的項目"]);
  });

  it("新增項目的排序只看自己的項目", async () => {
    await insertGoal({ name: "別人的", sortOrder: 7, userId: other });

    await createGoal(me, { name: "我的第一個", monthlyAmount: "1000", note: "" });

    expect((await listGoals(me))[0]).toMatchObject({ name: "我的第一個", sortOrder: 0, userId: me });
  });

  it("修改、停用別人的項目_當作不存在（丟使用者錯誤），資料與名稱快照都不變", async () => {
    const theirs = await insertGoal({ name: "別人的", userId: other });
    await insertEntry({ month: "2026-10-01", amount: 100, goalId: theirs.id, goalName: "別人的", userId: other });

    await expect(updateGoal(me, theirs.id, { name: "改掉", monthlyAmount: "1", note: "" })).rejects.toThrow(SavingsUserError);
    await expect(setGoalActive(me, theirs.id, false)).rejects.toThrow(SavingsUserError);

    expect(await goalRows()).toMatchObject([{ name: "別人的", monthlyAmount: 5000, active: true }]);
    expect((await entryRows()).map((e) => e.goalName)).toEqual(["別人的"]);
  });

  it("移動、刪除別人的項目_沒有效果", async () => {
    await insertGoal({ name: "B1", sortOrder: 0, userId: other });
    const theirs = await insertGoal({ name: "B2", sortOrder: 1, userId: other });
    await insertGoal({ name: "A1", sortOrder: 0 });

    await moveGoal(me, theirs.id, "up");
    await deleteGoal(me, theirs.id);

    expect((await listGoals(other)).map((g) => [g.name, g.sortOrder])).toEqual([
      ["B1", 0],
      ["B2", 1],
    ]);
  });

  it("記到別人的項目_當作不存在（丟使用者錯誤），不寫入", async () => {
    const theirs = await insertGoal({ name: "別人的", userId: other });

    await expect(addEntry(me, { goalId: theirs.id, month: "2026-10", amount: "100", note: "" }, NOW)).rejects.toThrow(SavingsUserError);
    expect(await entryRows()).toHaveLength(0);
  });

  it("新紀錄記在登入者名下", async () => {
    await addEntry(me, { goalId: null, month: "2026-10", amount: "100", note: "" }, NOW);

    expect((await entryRows())[0].userId).toBe(me);
  });

  it("刪除別人的紀錄_沒有效果，回傳 null", async () => {
    const theirs = await insertEntry({ month: "2026-10-01", amount: 100, userId: other });

    expect(await deleteEntry(me, theirs.id)).toBeNull();
    expect(await entryRows()).toHaveLength(1);
  });

  it("刪除帳號時，他的項目與紀錄一起刪除；別人的不受影響", async () => {
    const mine = await insertGoal({ name: "我的" });
    await insertEntry({ month: "2026-10-01", amount: 100, goalId: mine.id, goalName: "我的" });
    await insertGoal({ name: "別人的", userId: other });
    await insertEntry({ month: "2026-10-01", amount: 200, userId: other });

    await getDb().delete(coreUsers).where(eq(coreUsers.id, me));

    expect((await goalRows()).map((g) => g.name)).toEqual(["別人的"]);
    expect((await entryRows()).map((e) => e.amount)).toEqual([200]);
  });
});
