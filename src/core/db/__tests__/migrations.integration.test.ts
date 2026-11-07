import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openEmptyDb } from "@/dev/test-db";

// 推上 main 時 Vercel 部署與 db-migrate 同時進行
// migration 套用到正式資料庫時線上可能還是舊程式

const MIGRATIONS = "src/core/db/migrations";
const BASELINE = "0000_baseline";
// 正式資料庫最後套用的 migration 的時間戳記
const LAST_APPLIED_BEFORE_BASELINE = 1793987306364;
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type Journal = { entries: { idx: number; when: number; tag: string }[] };
const journal = () => JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;

let client: PGlite;
let db: ReturnType<typeof drizzle>;

// 每個測試要自己一步一步套 migration 所以從還沒套過的資料庫開始
beforeEach(async () => {
  client = await openEmptyDb();
  cleanups.push(() => client.close());
  db = drizzle(client);
});

const one = async <T>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows[0];

async function insertUser(id: string, username: string, role: "owner" | "member" = "member") {
  await client.query(`insert into core_users (id, username, password_hash, role) values ($1, $2, 'scrypt$x', $3)`, [id, username, role]);
}

const USERS = { early: "11111111-1111-4111-8111-111111111111", boss: "22222222-2222-4222-8222-222222222222" };

describe("基準檔（之前的 migration 合併成一個）", { timeout: 30_000 }, () => {
  it("排在第一個，時間戳記等於合併前正式資料庫最後套用的那一個；之後的 migration 都比它晚（drizzle 只套時間比最後一筆晚的）", () => {
    const [first, ...rest] = journal().entries;

    expect(first).toMatchObject({ idx: 0, tag: BASELINE, when: LAST_APPLIED_BEFORE_BASELINE });
    for (const entry of rest) expect(entry.when, entry.tag).toBeGreaterThan(LAST_APPLIED_BEFORE_BASELINE);
  });

  it("正式資料庫（表都在、最後一筆是合併前的最後一個）再跑 migrate 不會重跑基準檔，只套之後的", async () => {
    // 照正式資料庫的樣子 表已經建好 紀錄表只有最後一筆
    const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
    for (const statement of baseline.sql) await client.exec(statement);
    await client.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
    await client.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('last', $1)`, [LAST_APPLIED_BEFORE_BASELINE]);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { rows } = await client.query<{ created_at: string }>(`select created_at from drizzle.__drizzle_migrations order by id`);
    expect(rows.map((row) => Number(row.created_at))).toEqual([LAST_APPLIED_BEFORE_BASELINE, ...journal().entries.slice(1).map((entry) => entry.when)]);
  });
});

// Supabase 的 Data API 用 anon authenticated 讀寫 public 的表
// 開了 RLS 沒有 policy 就一列都碰不到 網站用擁有者連線不受限制
describe("每張表都開 RLS", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("public 的每張表都開了 RLS、沒有 FORCE（擁有者也會被擋），也沒有任何 policy：Supabase 安全建議的 rls_disabled_in_public", async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`,
    );
    const { rows: policies } = await client.query(`select tablename, policyname from pg_policies where schemaname = 'public'`);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.relrowsecurity || row.relforcerowsecurity)).toEqual([]);
    expect(policies).toEqual([]);
  });

  it("Data API 的角色（anon）就算有表與 sequence 的權限，每張表也一列都讀不到、寫不進去；不是 superuser 的擁有者（Supabase 的 postgres）照常讀寫", async () => {
    await client.query(`insert into core_users (username, password_hash, role) values ('owner', 'scrypt$x', 'owner')`);
    const { rows: tables } = await client.query<{ name: string }>(`select tablename as name from pg_tables where schemaname = 'public' order by 1`);
    // Supabase 預設也把 sequence 給了 anon serial 的表要有它才會走到 RLS 這一關
    await client.exec(`
      create role anon nologin;
      create role site_owner nologin;
      grant usage on schema public to anon, site_owner;
      grant select, insert, update, delete on all tables in schema public to anon;
      grant usage, select on all sequences in schema public to anon;
      alter table core_users owner to site_owner;
    `);

    await client.exec(`set role anon`);
    for (const { name } of tables) expect((await client.query(`select * from "${name}"`)).rows, name).toEqual([]);
    await expect(client.query(`insert into core_users (username, password_hash, role) values ('intruder', 'scrypt$y', 'owner')`)).rejects.toThrow(/row-level security/);
    expect((await client.query(`update core_users set password_hash = 'scrypt$z'`)).affectedRows).toBe(0);

    await client.exec(`reset role; set role site_owner`);
    await client.query(`update core_users set session_version = session_version + 1`);
    expect((await client.query(`select username, session_version from core_users`)).rows).toEqual([{ username: "owner", session_version: 2 }]);
  });
});

const statementsOf = (tag: string) =>
  readFileSync(path.join(MIGRATIONS, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

// 部署時舊程式還在跑 刪表 刪欄位或改名會讓它出錯
// 例外要使用者同意那一版直接收斂 照 migration 名稱逐條列在這裡 代價寫在 docs/deploy.md
const ALLOWED_CONVERGENCE: Record<string, string[]> = {
  // 使用者要的 資料表整理 v0.2.7 已經從 schema 拿掉 舊程式不再讀寫 這一版才刪
  "0001_route_order_and_cleanup": [
    'ALTER TABLE "savings_categories" DROP COLUMN "color";',
    'ALTER TABLE "savings_accounts" DROP COLUMN "due_day";',
    'ALTER TABLE "twitch_stream_events" DROP COLUMN "type";',
    ...["anthropic_key", "anthropic_model", "openai_key", "openai_model", "gemini_key", "gemini_model"].map((column) => `ALTER TABLE "youtube_settings" DROP COLUMN "${column}";`),
    'ALTER TABLE "youtube_translations" DROP COLUMN "batches";',
    'ALTER TABLE "youtube_translations" DROP COLUMN "next_batch";',
    // 使用者要的 翻譯設定改用 user_id 當主鍵 分兩版 這一版只換主鍵 舊的 id 欄留著給舊程式寫 下一版才刪
    'ALTER TABLE "youtube_settings" DROP CONSTRAINT "youtube_settings_pkey";',
    'ALTER TABLE "youtube_settings" DROP CONSTRAINT "youtube_settings_user_id_unique";',
  ],
};

describe("基準檔之後的 migration 都只擴充（明列的收斂例外除外）", () => {
  const pending = journal().entries.filter((entry) => entry.tag !== BASELINE);

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的表或鎖 core_users，等不到鎖就失敗、之後再重跑，不讓線上的查詢排在後面卡住", () => {
    for (const { tag } of pending) expect(statementsOf(tag)[0], tag).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("沒有 drop、rename、alter column，只有明列允許的那幾條（多一條、少一條都不行，例外只給還沒併進基準檔的 migration）；新欄位是 NOT NULL 的一定有預設值；新表開了 RLS", () => {
    expect(Object.keys(ALLOWED_CONVERGENCE).filter((tag) => !pending.some((entry) => entry.tag === tag))).toEqual([]);
    for (const { tag } of pending) {
      const statements = statementsOf(tag);
      const sql = statements.join("\n");
      const converging = statements.filter((statement) => /\bdrop\b|\brename\b|alter column/i.test(statement));
      expect(converging.sort(), tag).toEqual([...(ALLOWED_CONVERGENCE[tag] ?? [])].sort());
      for (const [, name, definition] of sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)) if (/NOT NULL/.test(definition)) expect(definition, `${tag} ${name}`).toMatch(/DEFAULT/);
      for (const [, table] of sql.matchAll(/CREATE TABLE "(\w+)"/g)) expect(sql, `${tag} ${table}`).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }
  });
});

// 刪除帳號時各表的外鍵 在 src/account-deletion.integration.test.ts 從資料庫的約束動態列出來檢查
describe("常用路線的順序與舊欄位收斂", { timeout: 30_000 }, () => {
  const columnsOf = async (table: string) => (await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = $1`, [table])).rows.map((row) => row.column_name);

  it("舊欄位刪掉 同一列其他資料留著 舊程式寫的常用路線排序是 0", async () => {
    const [baseline, latest] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
    for (const statement of baseline.sql) await client.exec(statement);
    await insertUser(USERS.early, "early");
    await client.query(`insert into savings_categories (user_id, kind, name, color) values ($1, 'expense', '餐飲', 'blue')`, [USERS.early]);
    await client.query(`insert into youtube_settings (user_id, provider, anthropic_key, glossary) values ($1, 'anthropic', 'v1:cipher', '[{"source":"민지","target":"珉池"}]')`, [USERS.early]);
    await client.query(`insert into transit_routes (user_id, mode, origin_id, origin_name, destination_id, destination_name) values ($1, 'tra', '1000', '臺北', '4400', '高雄')`, [USERS.early]);

    await client.transaction(async (tx) => {
      for (const statement of latest.sql) await tx.exec(statement);
    });

    expect(await columnsOf("savings_categories")).not.toContain("color");
    expect(await columnsOf("youtube_settings")).not.toContain("anthropic_key");
    expect((await client.query(`select name from savings_categories`)).rows).toEqual([{ name: "餐飲" }]);
    expect((await client.query(`select glossary from youtube_settings`)).rows).toEqual([{ glossary: [{ source: "민지", target: "珉池" }] }]);
    expect((await client.query(`select sort_order from transit_routes`)).rows).toEqual([{ sort_order: 0 }]);
  });

  it("舊程式在部署空窗期照樣寫得進去 不帶排序的常用路線排在最前面", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await insertUser(USERS.early, "early");

    await client.query(`insert into transit_routes (user_id, mode, origin_id, origin_name, destination_id, destination_name) values ($1, 'thsr', '1000', '台北', '1070', '左營')`, [USERS.early]);

    expect((await client.query(`select sort_order from transit_routes`)).rows).toEqual([{ sort_order: 0 }]);
  });
});

// 使用者要的 翻譯設定拿掉多餘的 id 改用 user_id 當主鍵 分兩版做
// 這一版換主鍵 id 欄留著 部署空窗期線上的舊程式 select 與 insert 都還會列出 id
describe("翻譯設定改用 user_id 當主鍵", { timeout: 30_000 }, () => {
  const primaryKeyOf = async (table: string) =>
    (
      await client.query<{ column: string }>(
        `select a.attname as column from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`,
        [table],
      )
    ).rows.map((row) => row.column);
  // 舊程式用 drizzle 寫 沒給的欄位寫 default
  const oldUpsert = (id: number | "default", userId: string, provider: string) =>
    client.query(
      `insert into "youtube_settings" ("id", "user_id", "provider", "glossary", "updated_at") values (${id}, $1, $2, '[]', default) on conflict ("user_id") do update set "provider" = $2, "updated_at" = now()`,
      [userId, provider],
    );
  const oldSelect = (userId: string) => one(`select "id", "user_id", "provider", "glossary", "updated_at" from "youtube_settings" where "user_id" = $1`, [userId]);

  it("原本的列都留著（含單人版留下的 id 1），主鍵換成 user_id，id 欄還在", async () => {
    const [baseline, latest] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
    for (const statement of baseline.sql) await client.exec(statement);
    await insertUser(USERS.boss, "boss", "owner");
    await insertUser(USERS.early, "early");
    await client.query(`insert into youtube_settings (id, user_id, provider, glossary) values (1, $1, 'openai', '[{"source":"민지","target":"珉池"}]')`, [USERS.boss]);
    await client.query(`insert into youtube_settings (user_id, provider) values ($1, 'gemini')`, [USERS.early]);

    await client.transaction(async (tx) => {
      for (const statement of latest.sql) await tx.exec(statement);
    });

    expect(await primaryKeyOf("youtube_settings")).toEqual(["user_id"]);
    expect((await client.query(`select id, user_id, provider, glossary from youtube_settings order by id`)).rows).toEqual([
      { id: 1, user_id: USERS.boss, provider: "openai", glossary: [{ source: "민지", target: "珉池" }] },
      { id: 2, user_id: USERS.early, provider: "gemini", glossary: [] },
    ]);
  });

  it("部署空窗期舊程式照樣讀寫：帶不帶 id 都寫得進去，同一個人再存一次是更新、不會多一列", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await insertUser(USERS.boss, "boss", "owner");
    await insertUser(USERS.early, "early");

    await oldUpsert("default", USERS.early, "openai");
    await oldUpsert(1, USERS.boss, "anthropic");
    await oldUpsert("default", USERS.early, "gemini");

    expect(await oldSelect(USERS.early)).toMatchObject({ user_id: USERS.early, provider: "gemini" });
    expect(await oldSelect(USERS.boss)).toMatchObject({ id: 1, provider: "anthropic" });
    expect(await one(`select count(*)::int as n from youtube_settings`)).toEqual({ n: 2 });
    await expect(client.query(`insert into youtube_settings (user_id) values ($1)`, [USERS.early])).rejects.toThrow(/youtube_settings_pkey/);
  });

  it("新程式比 migration 先上線：不帶 id、照 user_id 更新的寫法在舊的表上也寫得進去", async () => {
    const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
    for (const statement of baseline.sql) await client.exec(statement);
    await insertUser(USERS.early, "early");

    for (const provider of ["openai", "gemini"])
      await client.query(`insert into "youtube_settings" ("user_id", "provider", "glossary", "updated_at") values ($1, $2, '[]', default) on conflict ("user_id") do update set "provider" = $2`, [USERS.early, provider]);

    expect((await client.query(`select provider from youtube_settings`)).rows).toEqual([{ provider: "gemini" }]);
  });
});

describe("模組內資料之間的外鍵與唯一限制", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("模組權限每人每個模組一列，刪除帳號時一起刪；舊程式不帶暱稱的寫法照樣寫得進去（暱稱是 null）", async () => {
    const { boss } = USERS;
    await insertUser(boss, "boss");
    expect(await one(`select "nickname" from "core_users" where "id" = $1`, [boss])).toEqual({ nickname: null });

    await client.query(`insert into "core_module_denials" ("user_id", "module_id") values ($1, 'savings')`, [boss]);
    await expect(client.query(`insert into "core_module_denials" ("user_id", "module_id") values ($1, 'savings')`, [boss])).rejects.toThrow();
    await client.query(`insert into "core_module_denials" ("user_id", "module_id") values ($1, 'twitch')`, [boss]);

    await client.query(`delete from "core_users" where "id" = $1`, [boss]);
    expect(await one(`select count(*)::int as n from "core_module_denials"`)).toEqual({ n: 0 });
  });

  it("保留的影片每人每支一列；試過的兌換碼每個遊戲帳號每個碼一列，移除遊戲帳號或刪除帳號時一起刪", async () => {
    const { boss } = USERS;
    await insertUser(boss, "boss", "owner");
    await client.query(`insert into "youtube_saved_videos" ("user_id", "video_id", "pinned") values ($1, 'abcdefghijk', true)`, [boss]);
    await expect(client.query(`insert into "youtube_saved_videos" ("user_id", "video_id", "pinned") values ($1, 'abcdefghijk', false)`, [boss])).rejects.toThrow();

    const account = await one<{ id: number }>(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values ($1, '42', 'v1:x', '900000001', 'prod_official_cht') returning "id"`, [boss]);
    await client.query(`insert into "starrail_redeem_codes" ("account_id", "code", "result") values ($1, 'STARRAILGIFT', 'success')`, [account.id]);
    await expect(client.query(`insert into "starrail_redeem_codes" ("account_id", "code", "result") values ($1, 'STARRAILGIFT', 'already')`, [account.id])).rejects.toThrow();

    await client.query(`delete from "starrail_accounts" where "id" = $1`, [account.id]);
    expect(await one(`select count(*)::int as n from "starrail_redeem_codes"`)).toEqual({ n: 0 });
  });

  it("天氣的表：每人一列，縣市只收 22 個縣市（「台」要寫成「臺」），下雨通知預設開", async () => {
    const { early, boss } = USERS;
    await insertUser(boss, "boss", "owner");
    await insertUser(early, "early");

    await client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '臺北市')`, [boss]);
    await expect(client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '台北市')`, [early])).rejects.toThrow(/weather_settings_county/);
    await expect(client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '新北市')`, [boss])).rejects.toThrow(/weather_settings_pkey/);
    expect((await client.query(`select "user_id", "county", "rain_alert" from "weather_settings"`)).rows).toEqual([{ user_id: boss, county: "臺北市", rain_alert: true }]);
  });

  it("刪除持股時定期定額一起刪、買賣紀錄留著（holding_id 改成 null）；刪除投資帳戶時持股一起刪，別人的不受影響", async () => {
    const { early, boss } = USERS;
    await insertUser(early, "early");
    await insertUser(boss, "boss");
    async function seed(userId: string) {
      const deposit = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind") values ($1, '台銀', 'deposit') returning "id"`, [userId]);
      const broker = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind") values ($1, '證券', 'investment') returning "id"`, [userId]);
      const etf = await one<{ id: number }>(`insert into "savings_holdings" ("user_id", "account_id", "symbol", "name", "shares", "cost") values ($1, $2, '006208', '富邦台50', 10, 1200) returning "id"`, [userId, broker.id]);
      const tw50 = await one<{ id: number }>(`insert into "savings_holdings" ("user_id", "account_id", "symbol", "name", "shares", "cost") values ($1, $2, '0050', '元大台灣50', 5, 900) returning "id"`, [userId, broker.id]);
      const rule = await one<{ id: number }>(
        `insert into "savings_recurring" ("user_id", "kind", "account_id", "counter_account_id", "amount", "day_of_month", "mode", "holding_id") values ($1, 'transfer', $2, $3, 1000, 5, 'confirm', $4) returning "id"`,
        [userId, deposit.id, broker.id, etf.id],
      );
      const buy = await one<{ id: number }>(
        `insert into "savings_transactions" ("user_id", "kind", "account_id", "counter_account_id", "amount", "date", "holding_id", "shares", "cost_change", "recurring_id", "recurring_period") values ($1, 'transfer', $2, $3, 1000, '2026-10-05', $4, 8, 1000, $5, '2026-10-01') returning "id"`,
        [userId, deposit.id, broker.id, etf.id, rule.id],
      );
      return { broker, etf, tw50, rule, buy };
    }
    const mine = await seed(boss);
    const theirs = await seed(early);

    await client.query(`delete from "savings_holdings" where "id" = $1`, [mine.etf.id]);
    expect((await client.query(`select "id" from "savings_recurring" where "id" = $1`, [mine.rule.id])).rows).toEqual([]);
    expect(await one(`select "holding_id", "shares", "cost_change", "recurring_id", "recurring_period"::text as period from "savings_transactions" where "id" = $1`, [mine.buy.id])).toEqual({
      holding_id: null,
      shares: 8,
      cost_change: 1000,
      recurring_id: null,
      period: "2026-10-01",
    });

    await client.query(`delete from "savings_accounts" where "id" = $1`, [mine.broker.id]);
    expect((await client.query(`select "id" from "savings_holdings" where "user_id" = $1`, [boss])).rows).toEqual([]);
    expect((await client.query(`select "id" from "savings_holdings" where "user_id" = $1 order by "id"`, [early])).rows).toEqual([{ id: theirs.etf.id }, { id: theirs.tw50.id }]);
    expect((await client.query(`select "id" from "savings_recurring" where "id" = $1`, [theirs.rule.id])).rows).toHaveLength(1);
  });
});
