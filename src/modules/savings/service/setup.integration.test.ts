import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { savingsCategories, savingsPurposes } from "../data/schema";
import { SELECTABLE_COLORS } from "../lib/kinds";
import { setupDefaults } from "./setup";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
});

const purposesOf = async (userId: string) =>
  (await testDb.select().from(savingsPurposes).where(eq(savingsPurposes.userId, userId)).orderBy(asc(savingsPurposes.sortOrder), asc(savingsPurposes.id))).map((p) => [p.name, p.color, p.sortOrder]);
const categoriesOf = async (userId: string) =>
  (
    await testDb
      .select()
      .from(savingsCategories)
      .where(eq(savingsCategories.userId, userId))
      .orderBy(asc(savingsCategories.kind), asc(savingsCategories.sortOrder), asc(savingsCategories.id))
  ).map((c) => [c.kind, c.name, c.color, c.sortOrder, c.monthlyBudget]);

const DEFAULT_PURPOSES = [
  ["生活費", "blue", 0],
  ["緊急預備金", "amber", 1],
  ["投資", "violet", 2],
];
const DEFAULT_CATEGORIES = [
  ["expense", "餐飲", "orange", 0, null],
  ["expense", "交通", "blue", 1, null],
  ["expense", "訂閱", "violet", 2, null],
  ["expense", "提領現金", "teal", 3, null],
  ["income", "薪水", "green", 0, null],
];

/** 取 setupTestDb 底下的 PGlite 因為 TestDb 的型別沒有列出 drizzle 的 $client */
const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;

/** 記下送出的每一句 SQL 與交易的開始 */
function logQueries(): string[] {
  const queries: string[] = [];
  const pglite = pgliteOf(testDb);
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    queries.push("begin");
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (query) => queries.push(query) } });
  return queries;
}

describe("setupDefaults（開始使用）", () => {
  it("什麼都沒有_建預設的用途與分類（含顏色與順序）_回傳新建的數量", async () => {
    expect(await setupDefaults(me)).toEqual({ purposes: 3, categories: 5 });

    expect(await purposesOf(me)).toEqual(DEFAULT_PURPOSES);
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
  });

  it("預設的顏色都是使用者可以選的（沒有留給未分類、未設定用途的灰色）_同一份清單裡不重複", async () => {
    await setupDefaults(me);

    const purposeColors = (await purposesOf(me)).map(([, color]) => color);
    const categoryColors = (await categoriesOf(me)).map(([, , color]) => color);
    for (const color of [...purposeColors, ...categoryColors]) expect(SELECTABLE_COLORS).toContain(color);
    expect(new Set(purposeColors).size).toBe(purposeColors.length);
    expect(new Set(categoryColors).size).toBe(categoryColors.length);
  });

  it("再按一次_不會重複", async () => {
    await setupDefaults(me);

    expect(await setupDefaults(me)).toEqual({ purposes: 0, categories: 0 });
    expect(await purposesOf(me)).toEqual(DEFAULT_PURPOSES);
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
  });

  it("已經有用途（例如刪掉或改過預設的）_只補分類", async () => {
    await testDb.insert(savingsPurposes).values({ userId: me, name: "自己取的", color: "rose" });

    expect(await setupDefaults(me)).toEqual({ purposes: 0, categories: 5 });
    expect(await purposesOf(me)).toEqual([["自己取的", "rose", 0]]);
  });

  it("已經有分類（只有收入的也算）_只補用途", async () => {
    await testDb.insert(savingsCategories).values({ userId: me, kind: "income", name: "獎金", color: "teal" });

    expect(await setupDefaults(me)).toEqual({ purposes: 3, categories: 0 });
    expect(await categoriesOf(me)).toEqual([["income", "獎金", "teal", 0, null]]);
  });

  it("只看自己的：別人已經有用途與分類也照樣建；別人的資料不受影響", async () => {
    await setupDefaults(other);
    await testDb.insert(savingsPurposes).values({ userId: other, name: "別人另外加的", color: "teal", sortOrder: 3 });

    expect(await setupDefaults(me)).toEqual({ purposes: 3, categories: 5 });
    expect(await purposesOf(other)).toEqual([...DEFAULT_PURPOSES, ["別人另外加的", "teal", 3]]);
    expect(await categoriesOf(other)).toEqual(DEFAULT_CATEGORIES);
  });

  it("同時按兩次_只建一份", async () => {
    const results = await Promise.all([setupDefaults(me), setupDefaults(me)]);

    expect(results).toEqual(expect.arrayContaining([{ purposes: 3, categories: 5 }, { purposes: 0, categories: 0 }]));
    expect(await purposesOf(me)).toEqual(DEFAULT_PURPOSES);
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
  });

  it("數完之後、寫入之前有人新增了同名的用途與分類（例如另一個分頁）_略過那幾個、不丟錯，回傳實際新建的數量", async () => {
    // 新增用途與分類不會等使用者那把鎖 在數完的那一句之後
    // 用同一個交易寫進同名的資料 就像另一個請求剛好搶先寫入
    const pglite = pgliteOf(testDb);
    const transaction = pglite.transaction.bind(pglite);
    let raced = false;
    vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) =>
      transaction((tx) => {
        const query = tx.query.bind(tx);
        tx.query = (async (sql: string, ...rest: unknown[]) => {
          const result = await (query as (...args: unknown[]) => Promise<unknown>)(sql, ...rest);
          if (!raced && /count\(\*\).* from "savings_categories"/i.test(sql)) {
            raced = true;
            await query(`insert into savings_purposes (user_id, name, color) values ($1, '生活費', 'rose')`, [me]);
            await query(`insert into savings_categories (user_id, kind, name, color) values ($1, 'expense', '餐飲', 'teal')`, [me]);
          }
          return result;
        }) as typeof tx.query;
        return callback(tx);
      })) as typeof transaction);

    expect(await setupDefaults(me)).toEqual({ purposes: 2, categories: 4 });

    expect(raced).toBe(true);
    expect(await purposesOf(me)).toEqual([
      ["生活費", "rose", 0],
      ["緊急預備金", "amber", 1],
      ["投資", "violet", 2],
    ]);
    expect(await categoriesOf(me)).toEqual([["expense", "餐飲", "teal", 0, null], ...DEFAULT_CATEGORIES.slice(1)]);
  });

  it("數之前先在同一個交易裡鎖住這個使用者（core_users 那一列）：沒有用途時也沒有列可以鎖；PGlite 只有一條連線、交易本來就一個一個跑，所以直接看送出的 SQL", async () => {
    const queries = logQueries();

    await setupDefaults(me);

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "core_users" where .* for no key update$/i.test(query));
    const count = queries.findIndex((query) => /from "savings_purposes"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(count).toBeGreaterThan(lock);
  });
});
