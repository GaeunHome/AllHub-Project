import { eq } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { tagged } from "@/dev/test-helpers";
import { savingsEntries, savingsGoals } from "../data/schema";
import { cachedEntryTotals, cachedGoals, cachedMonthEntries } from "./cached";
import { deleteEntry } from "./savings";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

beforeEach(async () => {
  const [goal] = await testDb.insert(savingsGoals).values({ name: "旅遊基金", monthlyAmount: 3000 }).returning();
  await testDb.insert(savingsEntries).values([
    { month: "2026-10-01", goalId: goal.id, goalName: goal.name, amount: 3000 },
    { month: "2026-09-01", goalId: null, goalName: null, amount: 500 },
  ]);
});

describe("存錢記帳的快取讀取：標上讀到的資料、用 db 效期", () => {
  it("cachedGoals_savings:goals", async () => {
    expect((await cachedGoals()).map((g) => g.name)).toEqual(["旅遊基金"]);
    expect(tagged()).toEqual(["savings:goals"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedEntryTotals_所有紀錄的彙總：savings:entries 與 savings:totals", async () => {
    expect((await cachedEntryTotals()).map((t) => t.amount).sort()).toEqual([3000, 500]);
    expect(tagged()).toEqual(["savings:entries", "savings:totals"]);
  });

  it("cachedMonthEntries_單一月份：savings:entries 與 savings:month:<月份>", async () => {
    expect((await cachedMonthEntries("2026-10")).map((e) => e.amount)).toEqual([3000]);
    expect(tagged()).toEqual(["savings:entries", "savings:month:2026-10"]);
  });
});

describe("deleteEntry 回傳被刪那筆的月份：只讓那個月份的快取失效", () => {
  it("刪除成功_回傳月份", async () => {
    const [september] = await testDb.select().from(savingsEntries).where(eq(savingsEntries.amount, 500));

    expect(await deleteEntry(september.id)).toBe("2026-09");
  });

  it("已經不在了_回傳 null", async () => {
    expect(await deleteEntry(999_999)).toBeNull();
  });
});
