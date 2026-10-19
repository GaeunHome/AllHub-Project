import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { vi, type MockInstance } from "vitest";
import type { TestDb } from "@/dev/test-db";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsRecurring, savingsTransactions } from "../data/schema";

// 整合測試寫進測試資料庫的假資料與看送出 SQL 的工具 只有測試檔能 import
// 跟 fixtures.ts 分開 只算畫面與 lib 的測試不必載入 PGlite

type Insert<T extends { $inferInsert: unknown }> = Partial<T["$inferInsert"]>;

type RowDefaults = {
  account?: Insert<typeof savingsAccounts>;
  category?: Insert<typeof savingsCategories>;
  rule?: Insert<typeof savingsRecurring>;
  holding?: Insert<typeof savingsHoldings>;
};

/**
 * 寫進測試資料庫的資料 擁有者是 owner() 例如 beforeEach 建的 alice
 * defaults 是這個檔案的預設 例如帳戶都從很久以前開始記帳
 */
export function savingsRows(getDb: () => TestDb, owner: () => string, defaults: RowDefaults = {}) {
  const first = <T>(rows: T[]) => rows[0];
  return {
    insertAccount: async (values: Insert<typeof savingsAccounts> & { name: string }) =>
      first(await getDb().insert(savingsAccounts).values({ userId: owner(), kind: "deposit", ...defaults.account, ...values }).returning()),
    insertCategory: async (values: Insert<typeof savingsCategories> & { name: string }) =>
      first(await getDb().insert(savingsCategories).values({ userId: owner(), kind: "expense", color: "orange", ...defaults.category, ...values }).returning()),
    insertRule: async (values: Insert<typeof savingsRecurring> & { accountId: number; dayOfMonth: number }) =>
      first(await getDb().insert(savingsRecurring).values({ userId: owner(), kind: "expense", amount: 100, ...defaults.rule, ...values }).returning()),
    insertHolding: async (values: Insert<typeof savingsHoldings> & { accountId: number }) =>
      first(await getDb().insert(savingsHoldings).values({ userId: owner(), symbol: "006208", name: "富邦台50", shares: 12, cost: 3000, ...defaults.holding, ...values }).returning()),
    insertTransaction: async (values: Insert<typeof savingsTransactions> & { accountId: number; amount: number; date: string }) =>
      first(await getDb().insert(savingsTransactions).values({ userId: owner(), kind: "expense", ...values }).returning()),
    /** 所有人的紀錄 照建立的順序 */
    transactions: () => getDb().select().from(savingsTransactions).orderBy(asc(savingsTransactions.id)),
    ruleOf: async (id: number) => first(await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, id))),
    holdingOf: async (id: number) => first(await getDb().select().from(savingsHoldings).where(eq(savingsHoldings.id, id))),
  };
}

/** 取 setupTestDb 底下的 PGlite TestDb 的型別沒有列出 drizzle 的 $client */
export const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;

// PGlite 只有一條連線 交易本來就一個一個跑 要看的是送出的順序
function recordQueries<T>(db: TestDb, begin: T, entry: (sql: string, params: unknown[]) => T): T[] {
  const log: T[] = [];
  const pglite = pgliteOf(db);
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    log.push(begin);
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (sql, params) => log.push(entry(sql, params)) } });
  return log;
}

/** 記下送出的每一句 SQL 交易的開始記成 begin */
export const logQueries = (db: TestDb): string[] => recordQueries(db, "begin", (sql) => sql);

/** 跟 logQueries 一樣 另外記下參數 */
export const logStatements = (db: TestDb): { sql: string; params: unknown[] }[] => recordQueries(db, { sql: "begin", params: [] }, (sql, params) => ({ sql, params }));

/**
 * 正式環境經 drizzle 的 postgres-js 收到 Date 參數會丟錯
 * 測試的 PGlite 自己會轉而查不出來 所以直接看送出的參數
 */
export const dateParams = (query: MockInstance) => query.mock.calls.flatMap(([, params]) => (Array.isArray(params) ? params : [])).filter((param) => param instanceof Date);
