import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach } from "vitest";
import { coreUsers, type UserRole } from "@/core/db/schema";

export type TestDb = PgliteDatabase;

/** 每個測試一個全新的記憶體資料庫並套用正式 migration，掛到 core/db 讀的 globalThis.hubDb，被測的服務不必改就會用它 */
export function setupTestDb(onReady?: (db: TestDb) => void): () => TestDb {
  let client: PGlite | undefined;
  let current: TestDb | undefined;
  const holder = globalThis as unknown as { hubDb?: unknown };

  beforeEach(async () => {
    client = new PGlite();
    current = drizzle(client);
    await migrate(current, { migrationsFolder: "src/core/db/migrations" });
    holder.hubDb = current;
    onReady?.(current);
  });

  afterEach(async () => {
    holder.hubDb = undefined;
    await client?.close();
  });

  return () => {
    if (!current) throw new Error("setupTestDb 只能在測試執行期間使用");
    return current;
  };
}

/** 依使用者分開的資料表都有外鍵指向 core_users，測試要先建帳號；id 可以指定成 session-stub 的 TEST_SESSION.id，Server Action 讀到的登入者才對得上 */
export async function insertTestUser(db: TestDb, username: string, { id, role = "member" }: { id?: string; role?: UserRole } = {}): Promise<string> {
  const [user] = await db
    .insert(coreUsers)
    .values({ ...(id ? { id } : {}), username, passwordHash: "scrypt$unused", role })
    .returning({ id: coreUsers.id });
  return user.id;
}
