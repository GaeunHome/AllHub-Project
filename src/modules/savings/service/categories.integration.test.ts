import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { savingsAccounts, savingsCategories, savingsRecurring, savingsTransactions } from "../data/schema";
import { savingsRows } from "../dev/db-fixtures";
import { userError } from "../dev/fixtures";
import { createCategory, deleteCategory, listCategories, moveCategory, updateCategory } from "./categories";

const getDb = setupTestDb();
let me: string;
let other: string;
const { insertCategory } = savingsRows(getDb, () => me);

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

const NOT_FOUND = "找不到這個分類，可能已經刪除了";
const DUPLICATE = "已經有同名的分類";

const rowsOf = (userId: string, kind: "expense" | "income" = "expense") =>
  getDb()
    .select()
    .from(savingsCategories)
    .where(and(eq(savingsCategories.userId, userId), eq(savingsCategories.kind, kind)))
    .orderBy(asc(savingsCategories.sortOrder), asc(savingsCategories.id));
const namesOf = async (userId: string, kind: "expense" | "income" = "expense") => (await rowsOf(userId, kind)).map((c) => c.name);

const fields = (values: Partial<{ kind: string; name: string; monthlyBudget: string; icon: string }> = {}) => ({ kind: "expense", name: "餐飲", monthlyBudget: "", icon: "", ...values });

describe("listCategories", () => {
  it("只有自己的_支出在前、收入在後_各自依排序值與建立順序", async () => {
    await insertCategory({ name: "薪水", kind: "income", sortOrder: 0 });
    await insertCategory({ name: "交通", sortOrder: 1 });
    await insertCategory({ name: "獎金", kind: "income", sortOrder: 1 });
    await insertCategory({ name: "餐飲", sortOrder: 0 });
    await insertCategory({ name: "訂閱", sortOrder: 1 });
    await insertCategory({ name: "別人的", userId: other });

    expect((await listCategories(me)).map((c) => [c.kind, c.name])).toEqual([
      ["expense", "餐飲"],
      ["expense", "交通"],
      ["expense", "訂閱"],
      ["income", "薪水"],
      ["income", "獎金"],
    ]);
    expect((await listCategories(other)).map((c) => c.name)).toEqual(["別人的"]);
  });
});

describe("createCategory", () => {
  it("支出分類帶每月預算與圖示_排在同一類自己的最後面（收入與別人的排序不算）", async () => {
    await insertCategory({ name: "交通", sortOrder: 2 });
    await insertCategory({ name: "薪水", kind: "income", sortOrder: 7 });
    await insertCategory({ name: "別人的", sortOrder: 9, userId: other });

    const category = await createCategory(me, fields({ name: " 餐飲 ", monthlyBudget: "6,000", icon: "utensils" }));

    expect(category).toMatchObject({ userId: me, kind: "expense", name: "餐飲", monthlyBudget: 6000, sortOrder: 3, icon: "utensils" });
  });

  it("顏色由伺服器給（畫面不顯示，資料表要一個）_同一類自己還沒用過的第一個；收入與別人的不算", async () => {
    await insertCategory({ name: "交通", color: "blue" });
    await insertCategory({ name: "薪水", kind: "income", color: "teal" });
    await insertCategory({ name: "別人的", color: "teal", userId: other });

    expect(await createCategory(me, fields({ name: "餐飲" }))).toMatchObject({ color: "teal" });
    expect(await createCategory(me, fields({ kind: "income", name: "獎金" }))).toMatchObject({ color: "blue" });
  });

  it("沒選圖示_存成 null", async () => {
    expect(await createCategory(me, fields())).toMatchObject({ icon: null });
  });

  it("圖示不在選擇器上_丟使用者錯誤_沒有寫入", async () => {
    await userError(createCategory(me, fields({ icon: "rocket" })));
    expect(await rowsOf(me)).toEqual([]);
  });

  it("收入分類_預算不適用而存成 null_排序從 0 開始", async () => {
    expect(await createCategory(me, fields({ kind: "income", name: "薪水", monthlyBudget: "100" }))).toMatchObject({
      kind: "income",
      monthlyBudget: null,
      sortOrder: 0,
    });
  });

  it("類型不對_丟使用者錯誤_沒有寫入", async () => {
    await userError(createCategory(me, fields({ kind: "transfer" })));
    expect(await rowsOf(me)).toEqual([]);
  });

  it("同一類有同名的_丟使用者錯誤", async () => {
    await insertCategory({ name: "餐飲" });

    expect(await userError(createCategory(me, fields({ name: "餐飲" })))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["餐飲"]);
  });

  it("收入與支出可以有同名的分類（例如「其他」）", async () => {
    await insertCategory({ name: "其他" });

    await createCategory(me, fields({ kind: "income", name: "其他" }));

    expect(await namesOf(me, "income")).toEqual(["其他"]);
  });
});

describe("updateCategory", () => {
  it("改名稱、預算與圖示_類型建立後不能改（送來的類型忽略）、顏色不動", async () => {
    const food = await insertCategory({ name: "餐飲", monthlyBudget: 6000, icon: "utensils" });

    expect(await updateCategory(me, food.id, fields({ kind: "income", name: "吃飯", monthlyBudget: "", icon: "coffee" }))).toMatchObject({
      kind: "expense",
      name: "吃飯",
      color: "orange",
      monthlyBudget: null,
      icon: "coffee",
    });
    expect(await rowsOf(me)).toMatchObject([{ name: "吃飯", monthlyBudget: null, icon: "coffee" }]);
  });

  it("圖示改成不在選擇器上的_丟使用者錯誤_資料不變", async () => {
    const food = await insertCategory({ name: "餐飲", icon: "utensils" });

    await userError(updateCategory(me, food.id, fields({ icon: "constructor" })));
    expect(await rowsOf(me)).toMatchObject([{ icon: "utensils" }]);
  });

  it("資料庫裡還是灰色的分類（舊資料）_照樣改得了，顏色留著", async () => {
    const cash = await insertCategory({ name: "提領現金", color: "slate", monthlyBudget: 3000 });

    expect(await updateCategory(me, cash.id, fields({ name: "領現金", monthlyBudget: "3000" }))).toMatchObject({ name: "領現金", color: "slate" });
  });

  it("收入分類_送來的預算忽略", async () => {
    const salary = await insertCategory({ name: "薪水", kind: "income" });

    expect(await updateCategory(me, salary.id, fields({ name: "薪資", monthlyBudget: "5000" }))).toMatchObject({ kind: "income", name: "薪資", monthlyBudget: null });
  });

  it("改成同一類另一個分類的名稱_丟使用者錯誤_資料不變", async () => {
    await insertCategory({ name: "餐飲" });
    const transport = await insertCategory({ name: "交通" });

    expect(await userError(updateCategory(me, transport.id, fields({ name: "餐飲" })))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["餐飲", "交通"]);
  });

  it.each([999, 2_147_483_648])("分類 %i 不存在_找不到", async (id) => {
    expect(await userError(updateCategory(me, id, fields()))).toBe(NOT_FOUND);
  });
});

describe("moveCategory", () => {
  it("只在同一類裡移動", async () => {
    await insertCategory({ name: "薪水", kind: "income", sortOrder: 0 });
    await insertCategory({ name: "餐飲", sortOrder: 0 });
    const transport = await insertCategory({ name: "交通", sortOrder: 1 });
    await insertCategory({ name: "獎金", kind: "income", sortOrder: 1 });

    await moveCategory(me, transport.id, "up");

    expect(await namesOf(me)).toEqual(["交通", "餐飲"]);
    expect(await namesOf(me, "income")).toEqual(["薪水", "獎金"]);
  });

  it("已經是同一類的第一個_再往上不變", async () => {
    await insertCategory({ name: "薪水", kind: "income", sortOrder: 0 });
    const food = await insertCategory({ name: "餐飲", sortOrder: 0 });
    await insertCategory({ name: "交通", sortOrder: 1 });

    await moveCategory(me, food.id, "up");

    expect(await namesOf(me)).toEqual(["餐飲", "交通"]);
  });

  it("分類不存在_沒有效果", async () => {
    await insertCategory({ name: "餐飲", sortOrder: 0 });

    await moveCategory(me, 2_147_483_648, "up");

    expect(await namesOf(me)).toEqual(["餐飲"]);
  });
});

describe("deleteCategory", () => {
  it("刪掉_紀錄與固定收支改成未分類（紀錄留著）_回傳刪掉的名稱", async () => {
    const food = await insertCategory({ name: "餐飲" });
    const [account] = await getDb().insert(savingsAccounts).values({ userId: me, name: "國泰", kind: "deposit" }).returning();
    await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: account.id, categoryId: food.id, amount: 120, date: "2026-10-06" });
    await getDb().insert(savingsRecurring).values({ userId: me, kind: "expense", accountId: account.id, categoryId: food.id, amount: 390, dayOfMonth: 6 });

    expect(await deleteCategory(me, food.id)).toBe("餐飲");

    expect(await rowsOf(me)).toEqual([]);
    expect((await getDb().select().from(savingsTransactions)).map((t) => [t.amount, t.categoryId])).toEqual([[120, null]]);
    expect((await getDb().select().from(savingsRecurring)).map((r) => [r.amount, r.categoryId])).toEqual([[390, null]]);
  });

  it.each([999, 2_147_483_648])("分類 %i 不存在_回傳 null", async (id) => {
    expect(await deleteCategory(me, id)).toBeNull();
  });
});

describe("每個人只看得到、改得到自己的分類", () => {
  it("修改別人的分類_當作找不到，資料不變", async () => {
    const theirs = await insertCategory({ name: "別人的", monthlyBudget: 100, userId: other });

    expect(await userError(updateCategory(me, theirs.id, fields({ name: "改掉", monthlyBudget: "999" })))).toBe(NOT_FOUND);
    expect(await rowsOf(other)).toMatchObject([{ name: "別人的", monthlyBudget: 100 }]);
  });

  it("移動別人的分類_沒有效果", async () => {
    await insertCategory({ name: "B1", sortOrder: 0, userId: other });
    const theirs = await insertCategory({ name: "B2", sortOrder: 1, userId: other });

    await moveCategory(me, theirs.id, "up");

    expect((await rowsOf(other)).map((c) => [c.name, c.sortOrder])).toEqual([
      ["B1", 0],
      ["B2", 1],
    ]);
  });

  it("刪除別人的分類_回傳 null，分類與他的紀錄都不受影響", async () => {
    const theirs = await insertCategory({ name: "別人的", userId: other });
    const [account] = await getDb().insert(savingsAccounts).values({ userId: other, name: "他的帳戶", kind: "deposit" }).returning();
    await getDb().insert(savingsTransactions).values({ userId: other, kind: "expense", accountId: account.id, categoryId: theirs.id, amount: 1, date: "2026-10-01" });

    expect(await deleteCategory(me, theirs.id)).toBeNull();

    expect(await namesOf(other)).toEqual(["別人的"]);
    expect((await getDb().select().from(savingsTransactions))[0].categoryId).toBe(theirs.id);
  });

  it("新分類記在登入者名下_別人有同名的不影響", async () => {
    await insertCategory({ name: "餐飲", userId: other });

    await createCategory(me, fields());

    expect(await namesOf(me)).toEqual(["餐飲"]);
    expect(await namesOf(other)).toEqual(["餐飲"]);
  });
});
