import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { savingsCategories, savingsPurposes } from "../data/schema";
import { CATEGORY_ICON_NAMES, SELECTABLE_COLORS } from "../lib/kinds";
import { setupDefaults } from "./setup";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
});

const purposesOf = async (userId: string) => (await testDb.select().from(savingsPurposes).where(eq(savingsPurposes.userId, userId))).map((p) => p.name);
const categoriesOf = async (userId: string) =>
  (
    await testDb
      .select()
      .from(savingsCategories)
      .where(eq(savingsCategories.userId, userId))
      .orderBy(asc(savingsCategories.kind), asc(savingsCategories.sortOrder), asc(savingsCategories.id))
  ).map((c) => [c.kind, c.name, c.color, c.sortOrder, c.monthlyBudget, c.icon]);

const DEFAULT_CATEGORIES = [
  ["expense", "餐飲", "orange", 0, null, "utensils"],
  ["expense", "交通", "blue", 1, null, "bus"],
  ["expense", "訂閱", "violet", 2, null, "repeat"],
  ["expense", "提領現金", "teal", 3, null, "banknote"],
  ["income", "薪水", "green", 0, null, "briefcase"],
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
  it("什麼都沒有_建預設的分類（含顏色、順序與圖示）_回傳新建的數量；不再建用途（用途改成帳戶上的文字）", async () => {
    expect(await setupDefaults(me)).toEqual({ categories: 5 });

    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
    expect(await purposesOf(me)).toEqual([]);
  });

  it("預設分類的圖示都在選擇器上、顏色都是使用者可以選的（沒有留給未分類的灰色）_同一份清單裡顏色不重複", async () => {
    await setupDefaults(me);

    const rows = await categoriesOf(me);
    for (const [, name, color, , , icon] of rows) {
      expect(SELECTABLE_COLORS, String(name)).toContain(color);
      expect(CATEGORY_ICON_NAMES, String(name)).toContain(icon);
    }
    expect(new Set(rows.map(([, , color]) => color)).size).toBe(rows.length);
  });

  it("再按一次_不會重複", async () => {
    await setupDefaults(me);

    expect(await setupDefaults(me)).toEqual({ categories: 0 });
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
  });

  it("已經有分類（只有收入的也算）_不再建", async () => {
    await testDb.insert(savingsCategories).values({ userId: me, kind: "income", name: "獎金", color: "teal" });

    expect(await setupDefaults(me)).toEqual({ categories: 0 });
    expect(await categoriesOf(me)).toEqual([["income", "獎金", "teal", 0, null, null]]);
  });

  it("只看自己的：別人已經有分類也照樣建；別人的資料不受影響", async () => {
    await setupDefaults(other);
    await testDb.insert(savingsCategories).values({ userId: other, kind: "expense", name: "別人另外加的", color: "rose", sortOrder: 4 });

    expect(await setupDefaults(me)).toEqual({ categories: 5 });
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
    expect(await categoriesOf(other)).toEqual([...DEFAULT_CATEGORIES.slice(0, 4), ["expense", "別人另外加的", "rose", 4, null, null], DEFAULT_CATEGORIES[4]]);
  });

  it("同時按兩次_只建一份", async () => {
    const results = await Promise.all([setupDefaults(me), setupDefaults(me)]);

    expect(results).toEqual(expect.arrayContaining([{ categories: 5 }, { categories: 0 }]));
    expect(await categoriesOf(me)).toEqual(DEFAULT_CATEGORIES);
  });

  it("數完之後、寫入之前有人新增了同名的分類（例如另一個分頁）_略過那一個、不丟錯，回傳實際新建的數量", async () => {
    // 新增分類不會等使用者那把鎖 在數完的那一句之後
    // 用同一個交易寫進同名的分類 就像另一個請求剛好搶先寫入
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
            await query(`insert into savings_categories (user_id, kind, name, color) values ($1, 'expense', '餐飲', 'teal')`, [me]);
          }
          return result;
        }) as typeof tx.query;
        return callback(tx);
      })) as typeof transaction);

    expect(await setupDefaults(me)).toEqual({ categories: 4 });

    expect(raced).toBe(true);
    expect(await categoriesOf(me)).toEqual([["expense", "餐飲", "teal", 0, null, null], ...DEFAULT_CATEGORIES.slice(1)]);
  });

  it("數之前先在同一個交易裡鎖住這個使用者（core_users 那一列）：還沒有分類時沒有列可以鎖；PGlite 只有一條連線、交易本來就一個一個跑，所以直接看送出的 SQL", async () => {
    const queries = logQueries();

    await setupDefaults(me);

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "core_users" where .* for no key update$/i.test(query));
    const count = queries.findIndex((query) => /from "savings_categories"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(count).toBeGreaterThan(lock);
  });
});
