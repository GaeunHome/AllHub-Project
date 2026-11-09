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
const LAST_APPLIED_BEFORE_BASELINE = 1794116673330;
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

// Data API 用 anon 與 authenticated 讀寫 public 的表
// 開 RLS 不加 policy 就碰不到 網站用擁有者連線不受限
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
// 使用者同意直接收斂的照 migration 逐條列在這裡
const ALLOWED_CONVERGENCE: Record<string, string[]> = {};

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

// 刪除帳號的外鍵在 account-deletion.integration.test.ts 檢查
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
