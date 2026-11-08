import { asc, eq } from "drizzle-orm";
import type { MockInstance } from "vitest";
import type { TestDb } from "@/dev/test-db";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsRecurring, savingsTransactions } from "../data/schema";

// 整合測試寫進測試資料庫的假資料 只有測試檔能 import
// 跟 fixtures.ts 分開 只算畫面與 lib 的測試不必載入資料表

type Insert<T extends { $inferInsert: unknown }> = Partial<T["$inferInsert"]>;

type RowDefaults = {
  account?: Insert<typeof savingsAccounts>;
  category?: Insert<typeof savingsCategories>;
  rule?: Insert<typeof savingsRecurring>;
  holding?: Insert<typeof savingsHoldings>;
};

/**
 * 擁有者是 owner() 例如 beforeEach 建的 alice
 * defaults 例如帳戶都從很久以前開始記帳
 */
export function savingsRows(getDb: () => TestDb, owner: () => string, defaults: RowDefaults = {}) {
  const first = <T>(rows: T[]) => rows[0];
  return {
    insertAccount: async (values: Insert<typeof savingsAccounts> & { name: string }) =>
      first(await getDb().insert(savingsAccounts).values({ userId: owner(), kind: "deposit", ...defaults.account, ...values }).returning()),
    insertCategory: async (values: Insert<typeof savingsCategories> & { name: string }) =>
      first(await getDb().insert(savingsCategories).values({ userId: owner(), kind: "expense", ...defaults.category, ...values }).returning()),
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

/**
 * 正式環境的 postgres-js 收到 Date 參數會丟錯
 * PGlite 自己會轉而查不出來 所以看送出的參數
 */
export const dateParams = (query: MockInstance) => query.mock.calls.flatMap(([, params]) => (Array.isArray(params) ? params : [])).filter((param) => param instanceof Date);
