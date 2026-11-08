import { describe, expect, it, vi } from "vitest";
import { insertTestUsers, pgliteOf, setupTestDb } from "../test-db";

// 同一個檔案的測試共用一個資料庫 下面幾個測試刻意照順序跑
// 前一個留下東西 後一個確認都不見了 跟全新的資料庫一樣

const getDb = setupTestDb();

const tableNames = async () => {
  const { rows } = await pgliteOf(getDb()).query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`);
  return rows.map((row) => row.tablename);
};

const nextIds = async () => {
  const [me] = await pgliteOf(getDb()).query<{ id: string }>(`select id from core_users limit 1`).then((result) => result.rows);
  const account = await pgliteOf(getDb()).query<{ id: number }>(
    `insert into savings_accounts (user_id, kind, name) values ($1, 'deposit', '帳戶') returning id`,
    [me.id],
  );
  const announcement = await pgliteOf(getDb()).query<{ id: number }>(`insert into core_announcements (kind, title) values ('general', '公告') returning id`);
  return { account: account.rows[0].id, announcement: announcement.rows[0].id };
};

describe("setupTestDb：每個測試都像全新的資料庫", { shuffle: false }, () => {
  it("資料表都建好了，第一列的編號是資料表定義的起始值", async () => {
    await insertTestUsers(getDb());

    expect(await tableNames()).toEqual(expect.arrayContaining(["core_users", "savings_accounts", "core_announcements"]));
    expect(await nextIds()).toEqual({ account: 1, announcement: 1 });
  });

  it("上一個測試寫的資料都不見了（每張表都是空的）", async () => {
    const pglite = pgliteOf(getDb());
    const counts = await Promise.all(
      (await tableNames()).map(async (table) => {
        const { rows } = await pglite.query<{ count: number }>(`select count(*)::int as count from "${table}"`);
        return [table, rows[0].count] as const;
      }),
    );

    expect(counts.filter(([, count]) => count > 0)).toEqual([]);
  });

  it("上一個測試用掉的編號重新開始，不會接著算", async () => {
    await insertTestUsers(getDb());

    expect(await nextIds()).toEqual({ account: 1, announcement: 1 });
  });

  it("裝在連線上的 spy 這個測試結束後要拆掉", () => {
    vi.spyOn(pgliteOf(getDb()), "query");
    vi.spyOn(pgliteOf(getDb()), "transaction");

    expect(vi.isMockFunction(pgliteOf(getDb()).query)).toBe(true);
  });

  it("上一個測試的 spy 不會留到這個測試", () => {
    expect(vi.isMockFunction(pgliteOf(getDb()).query)).toBe(false);
    expect(vi.isMockFunction(pgliteOf(getDb()).transaction)).toBe(false);
  });
});
