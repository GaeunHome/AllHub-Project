import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { tagged } from "@/dev/test-helpers";
import { savingsAccounts, savingsCategories, savingsPurposes, savingsRecurring, savingsTransactions } from "../data/schema";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedCategoryTotals, cachedMonthTransactions, cachedPurposes, cachedRecurring } from "./cached";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
  const [purpose] = await testDb.insert(savingsPurposes).values({ userId: me, name: "生活費", color: "blue" }).returning();
  const [category] = await testDb.insert(savingsCategories).values({ userId: me, kind: "expense", name: "訂閱", color: "violet" }).returning();
  const [account] = await testDb.insert(savingsAccounts).values({ userId: me, name: "國泰", kind: "deposit", purposeId: purpose.id }).returning();
  const [rule] = await testDb.insert(savingsRecurring).values({ userId: me, kind: "expense", accountId: account.id, categoryId: category.id, amount: 390, dayOfMonth: 6 }).returning();
  await testDb.insert(savingsTransactions).values([
    { userId: me, kind: "expense", accountId: account.id, categoryId: category.id, amount: 390, date: "2026-10-06", recurringId: rule.id },
    { userId: me, kind: "income", accountId: account.id, amount: 43_000, date: "2026-09-05" },
  ]);
});

describe("理財的快取讀取：標上讀到的資料表、用 db 效期", () => {
  it("cachedAccounts_savings:accounts", async () => {
    expect((await cachedAccounts(me)).map((a) => a.name)).toEqual(["國泰"]);
    expect(tagged()).toEqual(["savings:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedPurposes_savings:purposes", async () => {
    expect((await cachedPurposes(me)).map((p) => p.name)).toEqual(["生活費"]);
    expect(tagged()).toEqual(["savings:purposes"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCategories_savings:categories", async () => {
    expect((await cachedCategories(me)).map((c) => c.name)).toEqual(["訂閱"]);
    expect(tagged()).toEqual(["savings:categories"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecurring_savings:recurring", async () => {
    expect((await cachedRecurring(me)).map((r) => r.amount)).toEqual([390]);
    expect(tagged()).toEqual(["savings:recurring"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedAccountFlows_所有紀錄的彙總：savings:transactions", async () => {
    expect((await cachedAccountFlows(me)).map((f) => [f.month, f.income, f.expense])).toEqual([
      ["2026-09", 43_000, 0],
      ["2026-10", 0, 390],
    ]);
    expect(tagged()).toEqual(["savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCategoryTotals_所有紀錄的彙總：savings:transactions", async () => {
    expect((await cachedCategoryTotals(me)).map((t) => [t.month, t.kind, t.amount])).toEqual([
      ["2026-09", "income", 43_000],
      ["2026-10", "expense", 390],
    ]);
    expect(tagged()).toEqual(["savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedMonthTransactions_單一月份，名稱是查詢時 join 的：帳戶或分類改名、刪除也要重讀（savings:transactions、accounts、categories）", async () => {
    expect((await cachedMonthTransactions(me, "2026-10")).map((t) => [t.accountName, t.categoryName, t.amount, t.recurring])).toEqual([["國泰", "訂閱", 390, true]]);
    expect(tagged()).toEqual(["savings:accounts", "savings:categories", "savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });
});

describe("依使用者的快取：使用者 id 是參數，別人讀到的是自己的那一份", () => {
  it("每個快取函式換成別人都是空的", async () => {
    expect(await cachedAccounts(other)).toEqual([]);
    expect(await cachedPurposes(other)).toEqual([]);
    expect(await cachedCategories(other)).toEqual([]);
    expect(await cachedRecurring(other)).toEqual([]);
    expect(await cachedAccountFlows(other)).toEqual([]);
    expect(await cachedCategoryTotals(other)).toEqual([]);
    expect(await cachedMonthTransactions(other, "2026-10")).toEqual([]);
  });
});
