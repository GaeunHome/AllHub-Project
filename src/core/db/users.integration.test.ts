import { asc, eq, getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { insertTestUsers, pgliteOf, setupTestDb } from "@/dev/test-db";
import { coreModuleDenials, coreNotifications, coreUsers } from "./schema";

const { activeOwnerOf, lockUserRow } = await import("./users");

const getDb = setupTestDb();

describe("activeOwnerOf：停用＝凍結，排程只處理擁有者還能用的列", () => {
  it("只留擁有者沒停用的列，被停用的人的略過", async () => {
    const db = getDb();
    const [alice, bob] = await insertTestUsers(db);
    await db.update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, bob));
    await db.insert(coreNotifications).values([
      { userId: alice, module: "demo", kind: "demo", title: "給 alice" },
      { userId: bob, module: "demo", kind: "demo", title: "給停用的 bob" },
    ]);

    const rows = await db
      .select(getTableColumns(coreNotifications))
      .from(coreNotifications)
      .innerJoin(coreUsers, activeOwnerOf(coreNotifications.userId, "demo"))
      .orderBy(asc(coreNotifications.id));

    expect(rows.map((row) => row.title)).toEqual(["給 alice"]);
  });

  it("沒有這個模組權限的人也凍結，別的模組不受影響；只記不能用的，沒有紀錄就是能用", async () => {
    const db = getDb();
    const [alice, bob] = await insertTestUsers(db);
    await db.insert(coreModuleDenials).values({ userId: bob, moduleId: "demo" });
    await db.insert(coreNotifications).values([
      { userId: alice, module: "demo", kind: "demo", title: "給 alice" },
      { userId: bob, module: "demo", kind: "demo", title: "給 bob" },
    ]);
    const titlesFor = async (moduleId: string) =>
      (
        await db
          .select(getTableColumns(coreNotifications))
          .from(coreNotifications)
          .innerJoin(coreUsers, activeOwnerOf(coreNotifications.userId, moduleId))
          .orderBy(asc(coreNotifications.id))
      ).map((row) => row.title);

    expect(await titlesFor("demo")).toEqual(["給 alice"]);
    expect(await titlesFor("other")).toEqual(["給 alice", "給 bob"]);
  });

  it("站長一律能用：就算資料庫裡有紀錄也不算", async () => {
    const db = getDb();
    const [alice] = await insertTestUsers(db);
    await db.insert(coreModuleDenials).values({ userId: alice, moduleId: "demo" });
    await db.insert(coreNotifications).values({ userId: alice, module: "demo", kind: "demo", title: "給 alice" });

    const rows = await db.select(getTableColumns(coreNotifications)).from(coreNotifications).innerJoin(coreUsers, activeOwnerOf(coreNotifications.userId, "demo"));

    expect(rows).toHaveLength(1);
  });
});

describe("lockUserRow：交易一開始先鎖使用者那一列", () => {
  // PGlite 只有一條連線 交易本來就一個一個跑 所以看送出的 SQL
  it.each(["key share", "no key update"] as const)("for %s 鎖的是這個人在 core_users 的那一列", async (mode) => {
    const [alice] = await insertTestUsers(getDb());
    const queries: { query: string; params: unknown[] }[] = [];
    const logged = drizzle(pgliteOf(getDb()), { logger: { logQuery: (query, params) => queries.push({ query, params }) } });

    await logged.transaction((tx) => lockUserRow(tx, alice, mode));

    expect(queries).toEqual([{ query: expect.stringMatching(new RegExp(`from "core_users" where "core_users"\\."id" = \\$1 for ${mode}$`)), params: [alice] }]);
  });
});
