import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { coreEnv } from "../env";

type Db = ReturnType<typeof createDb>;

/** db() 或交易裡的 tx 都可以 要跟其他寫入放在同一個交易時傳 tx */
export type Executor = PgDatabase<PgQueryResultHKT>;

/** 連線池沒回應時查詢等多久就報錯並重連 頁面與登出才不會一直轉圈 */
const QUERY_TIMEOUT_SECONDS = 20;

function createDb() {
  // prepare false 才能接 Supabase 的 transaction pooler 6543 port
  // 它在 Supavisor 2.10 以前收到管線化的查詢不會回應 所以一條連線一次只送一個
  const { DATABASE_URL, DATABASE_POOL_MAX } = coreEnv();
  const client = postgres(DATABASE_URL, { prepare: false, max: DATABASE_POOL_MAX, max_pipeline: 1, query_timeout: QUERY_TIMEOUT_SECONDS });
  return drizzle(client);
}

// 開發時熱重載會重跑模組 掛在 globalThis 上避免連線越開越多
const globalForDb = globalThis as unknown as { hubDb?: Db };

export function db(): Db {
  globalForDb.hubDb ??= createDb();
  return globalForDb.hubDb;
}
