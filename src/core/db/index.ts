import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { coreEnv } from "../env";

type Db = ReturnType<typeof createDb>;

function createDb() {
  // prepare: false 才能接 Supabase 的 transaction pooler（6543 port）
  const { DATABASE_URL, DATABASE_POOL_MAX } = coreEnv();
  const client = postgres(DATABASE_URL, { prepare: false, max: DATABASE_POOL_MAX });
  return drizzle(client);
}

// 開發時熱重載會重新執行模組，掛在 globalThis 上避免連線越開越多
const globalForDb = globalThis as unknown as { hubDb?: Db };

export function db(): Db {
  globalForDb.hubDb ??= createDb();
  return globalForDb.hubDb;
}
