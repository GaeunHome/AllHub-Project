import { openAsBlob } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, inject, vi } from "vitest";
import { coreUsers, type UserRole } from "@/core/db/schema";
import { OTHER_SESSION, TEST_SESSION } from "./session-stub";

export type TestDb = PgliteDatabase;

async function openSnapshot(file: string): Promise<PGlite> {
  const client = new PGlite({ loadDataDir: await openAsBlob(file) });
  await client.waitReady;
  return client;
}

/** 還沒套任何 migration 的資料庫 給測 migration 本身的測試 用完自己關掉 */
export const openEmptyDb = () => openSnapshot(inject("emptyDbSnapshot"));

// 清空用 delete 不用 truncate 每次約 5 毫秒 truncate 要 10 倍以上
// 暫時關掉外鍵檢查 順序就不用管誰指向誰
async function resetStatement(client: PGlite): Promise<string> {
  const { rows: tables } = await client.query<{ name: string }>(`select tablename as name from pg_tables where schemaname = 'public'`);
  const { rows: sequences } = await client.query<{ name: string; start: string }>(
    `select sequencename as name, start_value as start from pg_sequences where schemaname = 'public'`,
  );
  return [
    "set session_replication_role = replica",
    ...tables.map(({ name }) => `delete from "${name}"`),
    "set session_replication_role = default",
    ...sequences.map(({ name, start }) => `select setval('"${name}"', ${start}, false)`),
  ].join(";");
}

// 連線是共用的 測試裝在上面的 spy 不能留給下一個測試
function removeSpies(client: PGlite) {
  for (const method of ["query", "exec", "transaction"] as const) {
    const spy = client[method];
    if (vi.isMockFunction(spy)) spy.mockRestore();
  }
}

/**
 * 同一個檔案共用一個資料庫 每個測試前清空資料與序號
 * 所以測試裡不能改表結構 要改的放到自己的檔案
 */
export function setupTestDb(onReady?: (db: TestDb) => void): () => TestDb {
  let client: PGlite | undefined;
  let current: TestDb | undefined;
  let reset = "";
  const holder = globalThis as unknown as { hubDb?: unknown };

  beforeAll(async () => {
    client = await openSnapshot(inject("testDbSnapshot"));
    reset = await resetStatement(client);
  });

  beforeEach(async () => {
    await client?.exec(reset);
    current = drizzle(client as PGlite);
    holder.hubDb = current;
    onReady?.(current);
  });

  afterEach(() => {
    holder.hubDb = undefined;
    current = undefined;
    if (client) removeSpies(client);
  });

  afterAll(async () => {
    await client?.close();
  });

  return () => {
    if (!current) throw new Error("setupTestDb 只能在測試執行期間使用");
    return current;
  };
}

/**
 * 依使用者的表有外鍵 要先建帳號
 * id 給 TEST_SESSION.id 時 Server Action 的登入者才對得上
 */
export async function insertTestUser(db: TestDb, username: string, { id, role = "member" }: { id?: string; role?: UserRole } = {}): Promise<string> {
  const [user] = await db
    .insert(coreUsers)
    .values({ ...(id ? { id } : {}), username, passwordHash: "scrypt$unused", role })
    .returning({ id: coreUsers.id });
  return user.id;
}

/**
 * 站長 alice 與成員 bob 測擁有權與 IDOR 用
 * id 跟 TEST_SESSION 與 OTHER_SESSION 一樣
 */
export async function insertTestUsers(db: TestDb): Promise<[alice: string, bob: string]> {
  const alice = await insertTestUser(db, TEST_SESSION.username, { id: TEST_SESSION.id, role: TEST_SESSION.role });
  const bob = await insertTestUser(db, OTHER_SESSION.username, { id: OTHER_SESSION.id, role: OTHER_SESSION.role });
  return [alice, bob];
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

/** 換成會記下每句 SQL 的連線 BEGIN 由 PGlite 自己送 所以交易的開始另外記成 begin */
export const logQueries = (db: TestDb): string[] => recordQueries(db, "begin", (sql) => sql);

/** 跟 logQueries 一樣 另外記下參數 */
export const logStatements = (db: TestDb): { sql: string; params: unknown[] }[] => recordQueries(db, { sql: "begin", params: [] }, (sql, params) => ({ sql, params }));
