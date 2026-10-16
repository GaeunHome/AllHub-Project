import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// 推上 main 時 Vercel 部署與 db-migrate 同時進行
// migration 套用到正式資料庫時線上可能還是舊程式

const MIGRATIONS = "src/core/db/migrations";
// 0010 刪掉舊的存錢記帳 savings_goals 與 savings_entries
// 用到這兩張表的舊版測試套到 0009 為止
const BEFORE_LEGACY_DROP = 10;
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** 只含前 count 個 migration 的資料夾 模擬正式資料庫還停在舊版 */
function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "allhub-migrations-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number }[] };
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx < count) }));
  return dir;
}

let client: PGlite;
let db: ReturnType<typeof drizzle>;

// 啟動 PGlite 並套用舊版 migration 要好幾秒 機器忙時更久
// 所以放在 hook 裡用 vitest.config 的 hookTimeout
beforeEach(async () => {
  client = new PGlite();
  cleanups.push(() => client.close());
  db = drizzle(client);
  await migrate(db, { migrationsFolder: migrationsUpTo(5) });
});

// 測試本身還要再套一次 migration 預設的 5 秒在機器忙時不夠
describe("0005 多人化 migration", { timeout: 30_000 }, () => {
  it("既有的帳號（舊版只能是站長本人）變成 owner", async () => {
    await client.query(`insert into core_users (username, password_hash) values ('owner', 'scrypt$x')`);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { rows } = await client.query(`select username, role, disabled_at, failed_logins, locked_until from core_users`);
    expect(rows).toEqual([{ username: "owner", role: "owner", disabled_at: null, failed_logins: 0, locked_until: null }]);
  });

  it("套用後舊程式的寫法照常可用：只給帳號與雜湊的 insert 變成 member、明列欄位的 select 與改密碼的 update 都不受影響", async () => {
    await client.query(`insert into core_users (username, password_hash) values ('owner', 'scrypt$x')`);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await client.query(`insert into core_users (username, password_hash) values ('bob', 'scrypt$y')`);
    const { rows } = await client.query(`select "id", "username", "password_hash", "session_version", "created_at", "updated_at" from "core_users" where "username" = 'bob'`);
    await client.query(`update "core_users" set "password_hash" = 'scrypt$z', "session_version" = "session_version" + 1 where "username" = 'bob'`);

    expect(rows).toHaveLength(1);
    const { rows: roles } = await client.query(`select username, role, session_version from core_users order by username`);
    expect(roles).toEqual([
      { username: "bob", role: "member", session_version: 2 },
      { username: "owner", role: "owner", session_version: 1 },
    ]);
  });

  it("只有新增資料表與欄位（新欄位都有預設值或可為 null），沒有刪除或改名", () => {
    const sql = readFileSync(path.join(MIGRATIONS, "0005_multiuser.sql"), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    for (const column of sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)) expect(column[2], column[1]).toMatch(/DEFAULT|^timestamp with time zone$/);
  });
});

// 正式環境停在 v0.1.0 的 0004 時 0005 與 0006 會一起套用
// 0006 也要能接在 0005 後面
const PER_USER = "0006_per_user_data.sql";
const OWNER_SUBQUERY_USERS = { early: "11111111-1111-4111-8111-111111111111", boss: "22222222-2222-4222-8222-222222222222", late: "33333333-3333-4333-8333-333333333333" };

/** v0.1.0 單人版寫入的資料 drizzle 會明列它認得的欄位 新欄位不在裡面 */
async function seedSingleUserData() {
  await client.query(`insert into "twitch_streamers" ("broadcaster_id", "login", "display_name", "notify_enabled") values ('1035', 'alice', 'Alice', false), ('2048', 'bobby', 'Bobby', true)`);
  await client.query(`insert into "youtube_channels" ("channel_id", "title", "notify_enabled") values ('UCaaaaaaaaaaaaaaaaaaaaaa', '頻道 A', false)`);
  await client.query(
    `insert into "youtube_settings" ("id", "provider", "anthropic_key", "anthropic_key_hint", "glossary") values (1, 'anthropic', 'v1:cipher', 'abcd', '[{"source":"아이유","target":"IU"}]'::jsonb)`,
  );
  await client.query(
    `insert into "youtube_translations" ("video_id", "title", "status", "source_kind", "source_cues", "translated", "batches") values ('abcdefghijk', '影片', 'done', 'manual', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
  );
  await client.query(`insert into "starrail_accounts" ("ltuid", "cookie_encrypted", "uid", "region") values ('123', 'v1:cipher', '800000001', 'prod_official_asia')`);
  await client.query(`insert into "savings_goals" ("name", "monthly_amount", "sort_order") values ('緊急預備金', 10000, 0)`);
  await client.query(`insert into "savings_entries" ("month", "goal_id", "goal_name", "amount") values ('2026-10-01', 1, '緊急預備金', 10000), ('2026-10-01', null, null, 500)`);
  await client.query(`insert into "core_notifications" ("module", "kind", "title") values ('twitch', 'stream_online', 'Alice 開台了')`);
}

async function userIdsOf(table: string, column = "user_id") {
  const { rows } = await client.query<Record<string, string | null>>(`select "${column}" as owner from "${table}" order by 1`);
  return rows.map((row) => row.owner);
}

describe("0006 各模組資料依使用者分開", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    // 外層已套到 v0.1.0 的 0004 這裡再套多人化核心的 0005
    // 模擬目前最新的 migration
    await migrate(db, { migrationsFolder: migrationsUpTo(6) });
  });

  async function insertUser(id: string, username: string, role: "owner" | "member", createdAt: string) {
    await client.query(`insert into core_users (id, username, password_hash, role, created_at) values ($1, $2, 'scrypt$x', $3, $4)`, [id, username, role, createdAt]);
  }

  it("既有的資料都歸給最早建立的站長：追蹤（沿用原本的通知開關）、翻譯設定、星鐵帳號、記帳、通知；翻譯記下發起人與當時的專有名詞表", async () => {
    const { early, boss, late } = OWNER_SUBQUERY_USERS;
    await insertUser(early, "early", "member", "2026-01-01T00:00:00Z");
    await insertUser(boss, "boss", "owner", "2026-02-01T00:00:00Z");
    await insertUser(late, "late", "owner", "2026-03-01T00:00:00Z");
    await seedSingleUserData();

    await migrate(db, { migrationsFolder: migrationsUpTo(BEFORE_LEGACY_DROP) });

    const { rows: twitch } = await client.query(
      `select s.login, f.user_id, f.notify_enabled from twitch_follows f join twitch_streamers s on s.id = f.streamer_id order by s.login`,
    );
    expect(twitch).toEqual([
      { login: "alice", user_id: boss, notify_enabled: false },
      { login: "bobby", user_id: boss, notify_enabled: true },
    ]);
    const { rows: youtube } = await client.query(`select channel_id, user_id, notify_enabled from youtube_follows`);
    expect(youtube).toEqual([{ channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa", user_id: boss, notify_enabled: false }]);
    const { rows: settings } = await client.query(`select id, user_id, anthropic_key from youtube_settings`);
    expect(settings).toEqual([{ id: 1, user_id: boss, anthropic_key: "v1:cipher" }]);
    const { rows: translations } = await client.query(`select requested_by, glossary from youtube_translations`);
    expect(translations).toEqual([{ requested_by: boss, glossary: [{ source: "아이유", target: "IU" }] }]);
    expect(await userIdsOf("starrail_accounts")).toEqual([boss]);
    expect(await userIdsOf("savings_goals")).toEqual([boss]);
    expect(await userIdsOf("savings_entries")).toEqual([boss, boss]);
    expect(await userIdsOf("core_notifications")).toEqual([boss]);
  });

  it("沒有站長時歸給最早建立的帳號", async () => {
    const { early, late } = OWNER_SUBQUERY_USERS;
    await insertUser(late, "late", "member", "2026-03-01T00:00:00Z");
    await insertUser(early, "early", "member", "2026-01-01T00:00:00Z");
    await seedSingleUserData();

    await migrate(db, { migrationsFolder: MIGRATIONS });

    expect(await userIdsOf("starrail_accounts")).toEqual([early]);
    expect(await userIdsOf("twitch_follows")).toEqual([early, early]);
  });

  it("一個帳號都沒有時不動：沒有追蹤，其他資料的 user_id 維持 null（新程式不讀這些列）", async () => {
    await seedSingleUserData();

    await migrate(db, { migrationsFolder: MIGRATIONS });

    expect(await userIdsOf("twitch_follows")).toEqual([]);
    expect(await userIdsOf("youtube_follows")).toEqual([]);
    expect(await userIdsOf("starrail_accounts")).toEqual([null]);
    expect(await userIdsOf("core_notifications")).toEqual([null]);
    expect(await userIdsOf("youtube_translations", "requested_by")).toEqual([null]);
  });

  it("套用後舊程式（v0.1.0）的寫法照常可用；它在空窗期寫入的列 user_id 是 null", async () => {
    const { boss } = OWNER_SUBQUERY_USERS;
    await insertUser(boss, "boss", "owner", "2026-02-01T00:00:00Z");
    await seedSingleUserData();
    await migrate(db, { migrationsFolder: migrationsUpTo(BEFORE_LEGACY_DROP) });

    // 舊程式明列它認得的欄位 主播 頻道 通知開關
    await client.query(`insert into "twitch_streamers" ("broadcaster_id", "login", "display_name") values ('3001', 'carol', 'Carol') on conflict ("broadcaster_id") do nothing`);
    await client.query(`update "twitch_streamers" set "notify_enabled" = true where "login" = 'alice'`);
    await client.query(`delete from "twitch_streamers" where "login" = 'bobby'`);
    await client.query(`insert into "youtube_channels" ("channel_id", "title") values ('UCbbbbbbbbbbbbbbbbbbbbbb', '頻道 B')`);
    // 翻譯設定固定寫 id = 1 改到的是已經歸給站長的那一列
    await client.query(
      `insert into "youtube_settings" ("id", "provider", "glossary", "updated_at") values (1, 'gemini', '[]'::jsonb, now()) on conflict ("id") do update set "provider" = 'gemini'`,
    );
    await client.query(
      `insert into "youtube_translations" ("video_id", "status", "source_kind", "source_cues", "translated", "batches") values ('zyxwvutsrqp', 'queued', 'upload', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
    );
    await client.query(`insert into "starrail_accounts" ("ltuid", "cookie_encrypted", "uid", "region") values ('456', 'v1:x', '800000002', 'prod_official_usa')`);
    await client.query(`insert into "savings_goals" ("name", "monthly_amount", "sort_order") values ('旅行', 3000, (select coalesce(max("sort_order") + 1, 0) from "savings_goals"))`);
    await client.query(`insert into "savings_entries" ("month", "amount") values ('2026-10-01', 100)`);
    await client.query(`insert into "core_notifications" ("module", "kind", "title") values ('starrail', 'checkin', '簽到完成')`);
    const { rows: oldSelect } = await client.query(`select "id", "provider", "glossary" from "youtube_settings" where "id" = 1`);

    expect(oldSelect).toEqual([{ id: 1, provider: "gemini", glossary: [{ source: "아이유", target: "IU" }] }]);
    expect(await userIdsOf("youtube_settings")).toEqual([boss]);
    // 刪掉的主播連同追蹤一起刪除 空窗期加的主播沒有人追蹤
    const { rows: follows } = await client.query(`select s.login from twitch_follows f join twitch_streamers s on s.id = f.streamer_id`);
    expect(follows).toEqual([{ login: "alice" }]);
    expect(await userIdsOf("starrail_accounts")).toEqual([boss, null]);
    expect(await userIdsOf("savings_goals")).toEqual([boss, null]);
    expect(await userIdsOf("core_notifications")).toEqual([boss, null]);
    expect(await userIdsOf("youtube_translations", "requested_by")).toEqual([boss, null]);
    // 新程式不給 id 由 identity 從 2 開始編 不會跟舊程式固定的 1 衝突
    const { rows: created } = await client.query<{ id: number }>(`insert into "youtube_settings" ("user_id") values (null) returning "id"`);
    expect(created[0].id).toBeGreaterThanOrEqual(2);
  });

  it("刪除帳號時依使用者的資料一起刪除（外鍵 cascade），共用的翻譯留下、發起人改成 null", async () => {
    const { boss } = OWNER_SUBQUERY_USERS;
    await insertUser(boss, "boss", "owner", "2026-02-01T00:00:00Z");
    await seedSingleUserData();
    await migrate(db, { migrationsFolder: migrationsUpTo(BEFORE_LEGACY_DROP) });

    await client.query(`delete from core_users where id = $1`, [boss]);

    for (const table of ["twitch_follows", "youtube_follows", "youtube_settings", "starrail_accounts", "savings_goals", "savings_entries", "core_notifications"]) {
      const { rows } = await client.query(`select count(*)::int as n from "${table}"`);
      expect(rows, table).toEqual([{ n: 0 }]);
    }
    const { rows: translations } = await client.query(`select video_id, requested_by from youtube_translations`);
    expect(translations).toEqual([{ video_id: "abcdefghijk", requested_by: null }]);
    // 主播與頻道是共用的不跟著刪 沒人追蹤的由每天的排程清掉
    const { rows: shared } = await client.query(`select (select count(*)::int from twitch_streamers) as streamers, (select count(*)::int from youtube_channels) as channels`);
    expect(shared).toEqual([{ streamers: 2, channels: 1 }]);
  });

  it("只新增資料表與欄位：沒有刪除或改名；新欄位都可為 null 或有預設值；舊欄位只多了 BY DEFAULT 的 identity（舊程式明確給 id 仍可寫入）", () => {
    const sql = readFileSync(path.join(MIGRATIONS, PER_USER), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b/i);
    const alterColumns = [...sql.matchAll(/ALTER COLUMN "(\w+)" ([^;]+);/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(alterColumns).toEqual([expect.stringMatching(/^id ADD GENERATED BY DEFAULT AS IDENTITY \(.*START WITH 2\b/)]);
    for (const column of sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)) expect(column[2], column[1]).not.toMatch(/NOT NULL/);
  });
});

// v0.1.2 只新增保留影片的表 正式環境停在 v0.1.1 的 0006
const SAVED_VIDEOS = "0007_youtube_saved_videos.sql";

describe("0007 保留的影片（新表）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(7) });
  });

  async function insertUser(id: string, username: string) {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, $2, 'scrypt$x', 'member')`, [id, username]);
  }

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：新表的外鍵要鎖 core_users，等不到鎖就失敗、之後再重跑，不讓線上的登入排在後面卡住", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(7, 8);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只新增一張表與它的外鍵、索引：沒有刪除、改名，也不動既有的表", () => {
    const sql = readFileSync(path.join(MIGRATIONS, SAVED_VIDEOS), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    expect([...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|ON) "(\w+)"/g)].map((m) => m[1])).toEqual(expect.arrayContaining(["youtube_saved_videos"]));
    for (const [, table] of sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|CREATE INDEX "\w+" ON) "(\w+)"/g)) expect(table).toBe("youtube_saved_videos");
  });

  it("套用後舊程式（v0.1.1）的寫法照常可用；每人每支影片一列，刪除帳號時一起刪除", async () => {
    const { early, boss } = OWNER_SUBQUERY_USERS;
    await insertUser(early, "early");
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await client.query(
      `insert into "youtube_translations" ("video_id", "status", "source_kind", "source_cues", "translated", "batches", "requested_by") values ('abcdefghijk', 'queued', 'manual', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $1)`,
      [boss],
    );
    await client.query(`insert into "youtube_saved_videos" ("user_id", "video_id", "title", "pinned") values ($1, 'abcdefghijk', '影片', true), ($2, 'abcdefghijk', null, false)`, [boss, early]);
    await expect(client.query(`insert into "youtube_saved_videos" ("user_id", "video_id", "pinned") values ($1, 'abcdefghijk', false)`, [boss])).rejects.toThrow();

    await client.query(`delete from core_users where id = $1`, [boss]);

    expect(await userIdsOf("youtube_saved_videos")).toEqual([early]);
    expect(await userIdsOf("youtube_translations", "requested_by")).toEqual([null]);
  });
});

describe("從 v0.1.0（0004）直接升級：0005 與 0006 一起套用", { timeout: 30_000 }, () => {
  it("0005 與 0006 一開始都設 lock_timeout = 5s，而且是單獨一個 statement：等不到鎖就失敗、之後再重跑，不讓線上的查詢排在 ALTER TABLE 後面卡住", () => {
    const pending = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(5, 7);

    expect(pending).toHaveLength(2);
    for (const migration of pending) expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("舊版的帳號變成站長，單人版留下的資料都歸給他", async () => {
    await client.query(`insert into core_users (username, password_hash) values ('owner', 'scrypt$x')`);
    await seedSingleUserData();

    await migrate(db, { migrationsFolder: migrationsUpTo(BEFORE_LEGACY_DROP) });

    const { rows } = await client.query<{ id: string }>(`select id from core_users where username = 'owner' and role = 'owner'`);
    expect(rows).toHaveLength(1);
    expect(await userIdsOf("twitch_follows")).toEqual([rows[0].id, rows[0].id]);
    expect(await userIdsOf("youtube_settings")).toEqual([rows[0].id]);
    expect(await userIdsOf("savings_entries")).toEqual([rows[0].id, rows[0].id]);
    expect(await userIdsOf("core_notifications")).toEqual([rows[0].id]);
  });
});

// v0.1.4 Supabase 的 Data API 用 anon authenticated 讀寫 public 的表
// 開了 RLS 沒有 policy 就一列都碰不到 網站用擁有者連線不受限制
const ENABLE_RLS = "0008_enable_rls.sql";

describe("0008 每張表都開 RLS", { timeout: 30_000 }, () => {
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

  it("Data API 的角色（anon）就算有讀寫的權限也一列都讀不到、寫不進去；不是 superuser 的擁有者（Supabase 的 postgres）照常讀寫", async () => {
    await client.query(`insert into core_users (username, password_hash, role) values ('owner', 'scrypt$x', 'owner')`);
    await client.exec(`
      create role anon nologin;
      create role site_owner nologin;
      grant usage on schema public to anon, site_owner;
      grant select, insert, update, delete on all tables in schema public to anon;
      alter table core_users owner to site_owner;
    `);

    await client.exec(`set role anon`);
    expect((await client.query(`select id from core_users`)).rows).toEqual([]);
    await expect(client.query(`insert into core_users (username, password_hash, role) values ('intruder', 'scrypt$y', 'owner')`)).rejects.toThrow(/row-level security/);
    expect((await client.query(`update core_users set password_hash = 'scrypt$z'`)).affectedRows).toBe(0);

    await client.exec(`reset role; set role site_owner`);
    await client.query(`update core_users set session_version = session_version + 1`);
    expect((await client.query(`select username, session_version from core_users`)).rows).toEqual([{ username: "owner", session_version: 2 }]);
  });

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：開 RLS 要鎖住每張表，等不到鎖就失敗、之後再重跑，不讓線上的查詢排在後面卡住", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(8, 9);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只開 RLS：沒有刪除、改名，也不動欄位與資料", () => {
    const statements = readFileSync(path.join(MIGRATIONS, ENABLE_RLS), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .slice(1);

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) expect(statement).toMatch(/^ALTER TABLE "\w+" ENABLE ROW LEVEL SECURITY;$/);
  });
});

// v0.1.5 理財只新增五張表 正式環境停在 v0.1.4 的 0008
// 舊的存錢記帳 savings_goals 與 savings_entries 留到下一版
const FINANCE = "0009_finance.sql";
const FINANCE_TABLES = ["savings_accounts", "savings_categories", "savings_purposes", "savings_recurring", "savings_transactions"];

describe("0009 理財（新表）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(9) });
  });

  async function insertUser(id: string, username: string) {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, $2, 'scrypt$x', 'member')`, [id, username]);
  }

  /**
   * 一個人在每張理財的表各留下資料
   * 含彼此參照的外鍵 用途 分類 扣款帳戶 轉帳的另一邊 固定收支
   */
  async function seedFinance(userId: string, prefix: string) {
    const [purpose] = (await client.query<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '生活費', 'blue') returning "id"`, [userId])).rows;
    const [category] = (await client.query<{ id: number }>(`insert into "savings_categories" ("user_id", "kind", "name", "color", "monthly_budget") values ($1, 'expense', '餐飲', 'orange', 6000) returning "id"`, [userId])).rows;
    const [deposit] = (
      await client.query<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id", "opening_balance") values ($1, $2, 'deposit', $3, 1000) returning "id"`, [userId, `${prefix}存款`, purpose.id])
    ).rows;
    const [card] = (
      await client.query<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "due_day", "pay_from_account_id", "opening_balance") values ($1, $2, 'credit', 6, $3, -500) returning "id"`, [userId, `${prefix}信用卡`, deposit.id])
    ).rows;
    const [rule] = (
      await client.query<{ id: number }>(`insert into "savings_recurring" ("user_id", "kind", "account_id", "category_id", "amount", "day_of_month") values ($1, 'expense', $2, $3, 390, 6) returning "id"`, [userId, card.id, category.id])
    ).rows;
    await client.query(
      `insert into "savings_transactions" ("user_id", "kind", "account_id", "counter_account_id", "category_id", "amount", "date", "recurring_id") values ($1, 'expense', $2, null, $3, 390, '2026-10-06', $4), ($1, 'transfer', $5, $2, null, 500, '2026-10-07', null)`,
      [userId, card.id, category.id, rule.id, deposit.id],
    );
  }

  const countOf = async (table: string, userId: string) => (await client.query<{ n: number }>(`select count(*)::int as n from "${table}" where "user_id" = $1`, [userId])).rows[0].n;

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：新表的外鍵要鎖 core_users，等不到鎖就失敗、之後再重跑，不讓線上的登入排在後面卡住", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(9, 10);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只新增理財的五張表與它們的外鍵、索引、RLS：沒有刪除、改名，也不動既有的表（外鍵只指向 core_users 與新表）", () => {
    const sql = readFileSync(path.join(MIGRATIONS, FINANCE), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    expect([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort()).toEqual(FINANCE_TABLES);
    const touched = [...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX "\w+" ON) "(\w+)"/g)].map((m) => m[1]);
    expect(touched.length).toBeGreaterThan(FINANCE_TABLES.length * 3);
    expect(touched.filter((table) => !FINANCE_TABLES.includes(table))).toEqual([]);
    const referenced = [...sql.matchAll(/REFERENCES "public"\."(\w+)"/g)].map((m) => m[1]);
    expect(referenced).toContain("core_users");
    expect(referenced.filter((table) => table !== "core_users" && !FINANCE_TABLES.includes(table))).toEqual([]);
    for (const table of FINANCE_TABLES) expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  });

  it("套用後新表都開了 RLS、沒有 FORCE、沒有 policy；Data API 的角色（anon）讀不到也寫不進去", async () => {
    const boss = OWNER_SUBQUERY_USERS.boss;
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await seedFinance(boss, "");

    const { rows } = await client.query(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = any($1) order by relname`, [FINANCE_TABLES]);
    expect(rows).toEqual(FINANCE_TABLES.map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: false })));
    expect((await client.query(`select policyname from pg_policies where tablename = any($1)`, [FINANCE_TABLES])).rows).toEqual([]);

    // Supabase 預設也把 sequence 給了 anon
    // serial 的表要有 sequence 的權限才會走到 RLS 這一關
    await client.exec(
      `create role anon nologin; grant usage on schema public to anon; grant select, insert, update, delete on all tables in schema public to anon; grant usage, select on all sequences in schema public to anon; set role anon`,
    );
    for (const table of FINANCE_TABLES) expect((await client.query(`select * from "${table}"`)).rows, table).toEqual([]);
    await expect(client.query(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '入侵', 'rose')`, [boss])).rejects.toThrow(/row-level security/);
    await client.exec(`reset role`);
  });

  it("套用後舊程式（v0.1.4）的存錢記帳寫法照常可用（部署空窗期還會跑幾分鐘），舊表的約束也還在", async () => {
    const boss = OWNER_SUBQUERY_USERS.boss;
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: migrationsUpTo(BEFORE_LEGACY_DROP) });

    // v0.1.4 的 createGoal addEntry updateGoal 含名稱快照
    // setGoalActive deleteGoal 與讀取 欄位都明列
    await client.query(
      `insert into "savings_goals" ("id", "user_id", "name", "monthly_amount", "note", "active", "sort_order", "created_at") values (default, $1, '旅行', 3000, null, default, (select coalesce(max("sort_order") + 1, 0) from "savings_goals" where "savings_goals"."user_id" = $1), default)`,
      [boss],
    );
    const [goal] = (await client.query<{ id: number }>(`select "id" from "savings_goals" where "user_id" = $1`, [boss])).rows;
    await client.query(
      `insert into "savings_entries" ("id", "user_id", "month", "goal_id", "goal_name", "amount", "note", "created_at") values (default, $1, '2026-10-01', $2, '旅行', 3000, null, default), (default, $1, '2026-10-01', null, null, 500, '發票中獎', default)`,
      [boss, goal.id],
    );
    await client.query(`update "savings_goals" set "name" = '日本旅行', "monthly_amount" = 4000 where ("savings_goals"."id" = $1 and "savings_goals"."user_id" = $2)`, [goal.id, boss]);
    await client.query(`update "savings_entries" set "goal_name" = '日本旅行' where "savings_entries"."goal_id" = $1`, [goal.id]);
    await client.query(`update "savings_goals" set "active" = false where ("savings_goals"."id" = $1 and "savings_goals"."user_id" = $2)`, [goal.id, boss]);
    const { rows: entries } = await client.query(`select "month"::text as month, "goal_name", "amount", "note" from "savings_entries" where "user_id" = $1 order by "id"`, [boss]);
    expect(entries).toEqual([
      { month: "2026-10-01", goal_name: "日本旅行", amount: 3000, note: null },
      { month: "2026-10-01", goal_name: null, amount: 500, note: "發票中獎" },
    ]);
    await client.query(`delete from "savings_goals" where ("savings_goals"."id" = $1 and "savings_goals"."user_id" = $2)`, [goal.id, boss]);
    expect((await client.query(`select "goal_id", "goal_name" from "savings_entries" where "amount" = 3000`)).rows).toEqual([{ goal_id: null, goal_name: "日本旅行" }]);

    await expect(client.query(`insert into "savings_entries" ("user_id", "month", "amount") values ($1, '2026-10-01', 0)`, [boss])).rejects.toThrow(/savings_entries_amount_range/);
    await expect(client.query(`insert into "savings_entries" ("user_id", "month", "amount") values ($1, '2026-10-15', 100)`, [boss])).rejects.toThrow(/savings_entries_month_first_day/);
  });

  it("刪除帳號時理財的資料一起刪除（外鍵 cascade，含彼此參照的列）；別人的不受影響", async () => {
    const { early, boss } = OWNER_SUBQUERY_USERS;
    await insertUser(early, "early");
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await seedFinance(early, "早");
    await seedFinance(boss, "老闆");

    await client.query(`delete from core_users where id = $1`, [boss]);

    for (const table of FINANCE_TABLES) {
      expect(await countOf(table, boss), table).toBe(0);
      expect(await countOf(table, early), `${table}（別人的）`).toBeGreaterThan(0);
    }
    expect(await countOf("savings_transactions", early)).toBe(2);
  });
});

// 刪表或刪欄位會讓部署空窗期的舊程式出錯 一律不准
// 例外只有明列的這幾句 v0.1.5 起程式就不讀寫的舊表
const ALLOWED_DROPS: [file: string, statement: string][] = [
  ["0010_finance_v2.sql", 'DROP TABLE "savings_entries";'],
  ["0010_finance_v2.sql", 'DROP TABLE "savings_goals";'],
];

const statementsOf = (file: string) =>
  readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

describe("所有 migration 都不刪除", () => {
  it("沒有 drop：唯一的例外是 0010 刪掉 v0.1.5 起就不讀寫的 savings_goals、savings_entries（明列的白名單，其他 drop 照樣失敗）", () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
    const drops = files.flatMap((file) => statementsOf(file).filter((statement) => /\bdrop\b/i.test(statement)).map((statement): [string, string] => [file, statement]));

    expect(files.length).toBeGreaterThanOrEqual(11);
    expect(drops).toEqual(ALLOWED_DROPS);
  });
});

// v0.1.6 理財加上持股 信用卡帳單 固定收支的期別與待處理
// 正式環境停在 v0.1.5 的 0009
const FINANCE_V2 = "0010_finance_v2.sql";
const FINANCE_V2_TABLES = ["savings_accounts", "savings_holdings", "savings_recurring", "savings_transactions"];

describe("0010 理財：持股、信用卡結帳日、固定收支的期別（只擴充，加上刪除兩張舊表）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(10) });
  });

  async function insertUser(id: string, username: string) {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, $2, 'scrypt$x', 'member')`, [id, username]);
  }

  const one = async <T>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows[0];

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的表、新表的外鍵要鎖 core_users，等不到鎖就失敗、之後再重跑", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(10, 11);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只動理財的表：新表 savings_holdings、新欄位都可為 null 或有預設值、沒有改名與 alter column；外鍵只指向 core_users 與理財的表", () => {
    const sql = readFileSync(path.join(MIGRATIONS, FINANCE_V2), "utf8");

    expect(sql).not.toMatch(/\brename\b|alter column/i);
    expect([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1])).toEqual(["savings_holdings"]);
    const touched = [...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE (?:UNIQUE )?INDEX "\w+" ON) "(\w+)"/g)].map((m) => m[1]);
    expect(touched.filter((table) => !FINANCE_V2_TABLES.includes(table) && !["savings_goals", "savings_entries"].includes(table))).toEqual([]);
    const columns = [...sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)];
    expect(columns.length).toBeGreaterThanOrEqual(15);
    for (const [, name, definition] of columns) if (/NOT NULL/.test(definition)) expect(definition, name).toMatch(/DEFAULT/);
    const referenced = [...sql.matchAll(/REFERENCES "public"\."(\w+)"/g)].map((m) => m[1]);
    expect(referenced.filter((table) => table !== "core_users" && !table.startsWith("savings_"))).toEqual([]);
    expect(sql).toContain(`ALTER TABLE "savings_holdings" ENABLE ROW LEVEL SECURITY;`);
  });

  it("套用後 savings_goals、savings_entries 不存在了（連同裡面的資料），理財的其他表照常", async () => {
    const boss = OWNER_SUBQUERY_USERS.boss;
    await insertUser(boss, "boss");
    await client.query(`insert into "savings_goals" ("user_id", "name", "monthly_amount") values ($1, '旅行', 3000)`, [boss]);
    await client.query(`insert into "savings_entries" ("user_id", "month", "amount") values ($1, '2026-10-01', 500)`, [boss]);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema = 'public' and table_name like 'savings_%' order by 1`);
    expect(rows.map((row) => row.name)).toEqual(["savings_accounts", "savings_card_bills", "savings_categories", "savings_holdings", "savings_purposes", "savings_recurring", "savings_transactions"]);
  });

  it("套用後舊程式（v0.1.5）的寫法照常可用；舊程式新增的固定收支維持每月、照原日、自動記帳，信用卡不是自動扣繳", async () => {
    const boss = OWNER_SUBQUERY_USERS.boss;
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: MIGRATIONS });

    // v0.1.5 的 insert 明列它認得的欄位 沒給的用 default
    const deposit = await one<{ id: number }>(
      `insert into "savings_accounts" ("id", "user_id", "name", "kind", "purpose_id", "opening_balance", "opening_cost", "monthly_plan", "target_amount", "due_day", "pay_from_account_id", "active", "sort_order", "created_at") values (default, $1, '國泰', 'deposit', null, 1000, null, null, null, null, null, default, 0, default) returning "id"`,
      [boss],
    );
    const card = await one<{ id: number }>(
      `insert into "savings_accounts" ("id", "user_id", "name", "kind", "purpose_id", "opening_balance", "opening_cost", "monthly_plan", "target_amount", "due_day", "pay_from_account_id", "active", "sort_order", "created_at") values (default, $1, '信用卡', 'credit', null, -500, null, null, null, 20, $2, default, 1, default) returning "id"`,
      [boss, deposit.id],
    );
    const rule = await one<{ id: number }>(
      `insert into "savings_recurring" ("id", "user_id", "kind", "account_id", "counter_account_id", "category_id", "amount", "day_of_month", "note", "active", "last_posted_month", "created_at") values (default, $1, 'expense', $2, null, null, 390, 6, 'Netflix', default, default, $3) returning "id"`,
      [boss, card.id, new Date("2026-10-01T04:00:00Z")],
    );
    await client.query(
      `insert into "savings_transactions" ("id", "user_id", "kind", "account_id", "counter_account_id", "category_id", "amount", "date", "note", "recurring_id", "created_at") values (default, $1, 'expense', $2, null, null, 390, '2026-10-06', 'Netflix', $3, default), (default, $1, 'transfer', $4, $2, null, 500, '2026-10-07', null, null, default)`,
      [boss, card.id, rule.id, deposit.id],
    );
    await client.query(`update "savings_recurring" set "last_posted_month" = '2026-10-01' where ("savings_recurring"."id" = $1 and ("savings_recurring"."last_posted_month" is null or "savings_recurring"."last_posted_month" < $2))`, [rule.id, "2026-10-01"]);
    await client.query(`update "savings_accounts" set "name" = '國泰卡', "due_day" = 25 where ("savings_accounts"."id" = $1 and "savings_accounts"."user_id" = $2)`, [card.id, boss]);

    expect(await one(`select "interval_months", "start_month", "holiday_rule", "mode", "holding_id", "allocate", "last_notified_on", "last_posted_month"::text as last from "savings_recurring" where "id" = $1`, [rule.id])).toEqual({
      interval_months: 1,
      start_month: null,
      holiday_rule: "none",
      mode: "auto",
      holding_id: null,
      allocate: false,
      last_notified_on: null,
      last: "2026-10-01",
    });
    expect(await one(`select "statement_day", "autopay", "card_notified_on", "due_day" from "savings_accounts" where "id" = $1`, [card.id])).toEqual({ statement_day: null, autopay: false, card_notified_on: null, due_day: 25 });
    const { rows: transactions } = await client.query(`select "holding_id", "shares", "cost_change", "recurring_period" from "savings_transactions" order by "id"`);
    expect(transactions).toEqual([
      { holding_id: null, shares: null, cost_change: null, recurring_period: null },
      { holding_id: null, shares: null, cost_change: null, recurring_period: null },
    ]);
  });

  it("v0.1.5 留下的理財資料（用途、分類、帳戶、固定收支、紀錄）套用之後的 migration 都沒被新的約束擋下，原本的欄位一字不差，新欄位是預設值", async () => {
    const boss = OWNER_SUBQUERY_USERS.boss;
    await insertUser(boss, "boss");
    // v0.1.5 的程式寫得出來的各種資料 含溢繳的卡 停用的帳戶 負的調整 自動記的紀錄
    const purpose = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color", "sort_order") values ($1, '生活費', 'blue', 0) returning "id"`, [boss]);
    const food = await one<{ id: number }>(`insert into "savings_categories" ("user_id", "kind", "name", "color", "monthly_budget", "sort_order") values ($1, 'expense', '餐飲', 'orange', 6000, 0) returning "id"`, [boss]);
    const salary = await one<{ id: number }>(`insert into "savings_categories" ("user_id", "kind", "name", "color", "sort_order") values ($1, 'income', '薪水', 'green', 1) returning "id"`, [boss]);
    const deposit = await one<{ id: number }>(
      `insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id", "opening_balance", "monthly_plan", "target_amount", "sort_order") values ($1, '台銀', 'deposit', $2, 1000, 5000, 100000, 0) returning "id"`,
      [boss, purpose.id],
    );
    const broker = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "opening_balance", "opening_cost", "sort_order") values ($1, '證券', 'investment', 80000, 75000, 1) returning "id"`, [boss]);
    const card = await one<{ id: number }>(
      `insert into "savings_accounts" ("user_id", "name", "kind", "due_day", "pay_from_account_id", "opening_balance", "sort_order") values ($1, '國泰卡', 'credit', 31, $2, -500, 2) returning "id"`,
      [boss, deposit.id],
    );
    const overpaid = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "opening_balance", "active", "sort_order") values ($1, '舊卡', 'credit', 300, false, 3) returning "id"`, [boss]);
    const netflix = await one<{ id: number }>(
      `insert into "savings_recurring" ("user_id", "kind", "account_id", "category_id", "amount", "day_of_month", "note", "last_posted_month", "created_at") values ($1, 'expense', $2, $3, 390, 31, 'Netflix', '2026-09-01', $4) returning "id"`,
      [boss, card.id, food.id, new Date("2026-08-01T04:00:00Z")],
    );
    await client.query(`insert into "savings_recurring" ("user_id", "kind", "account_id", "counter_account_id", "amount", "day_of_month", "active") values ($1, 'transfer', $2, $3, 5000, 10, false)`, [boss, deposit.id, broker.id]);
    await client.query(
      `insert into "savings_transactions" ("user_id", "kind", "account_id", "counter_account_id", "category_id", "amount", "date", "note", "recurring_id") values
        ($1, 'income', $2, null, $3, 43000, '2026-10-05', '十月薪水', null),
        ($1, 'expense', $4, null, $5, 390, '2026-09-30', 'Netflix', $6),
        ($1, 'transfer', $2, $7, null, 5000, '2026-10-06', null, null),
        ($1, 'transfer', $2, $4, null, 500, '2026-10-07', null, null),
        ($1, 'adjust', $7, null, null, -1200, '2026-10-08', null, null),
        ($1, 'adjust', $4, null, null, 80, '2026-10-09', null, null),
        ($1, 'expense', $8, null, null, 120, '2026-01-02', '早餐', null)`,
      [boss, deposit.id, salary.id, card.id, food.id, netflix.id, broker.id, overpaid.id],
    );
    const tables = ["savings_purposes", "savings_categories", "savings_accounts", "savings_recurring", "savings_transactions"];
    const snapshot = async (columns?: Record<string, string[]>) =>
      Object.fromEntries(
        await Promise.all(tables.map(async (table) => [table, (await client.query<Record<string, unknown>>(`select ${columns ? columns[table].map((c) => `"${c}"`).join(", ") : "*"} from "${table}" order by "id"`)).rows] as const)),
      );
    const before = await snapshot();

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const oldColumns = Object.fromEntries(tables.map((table) => [table, Object.keys(before[table][0])]));
    expect(await snapshot(oldColumns)).toEqual(before);
    expect((await client.query(`select distinct "interval_months", "start_month", "holiday_rule", "mode", "holding_id", "allocate", "last_notified_on" from "savings_recurring"`)).rows).toEqual([
      { interval_months: 1, start_month: null, holiday_rule: "none", mode: "auto", holding_id: null, allocate: false, last_notified_on: null },
    ]);
    expect((await client.query(`select distinct "statement_day", "autopay", "card_notified_on" from "savings_accounts"`)).rows).toEqual([{ statement_day: null, autopay: false, card_notified_on: null }]);
    expect((await client.query(`select distinct "holding_id", "shares", "cost_change", "recurring_period", "card_bill_id" from "savings_transactions"`)).rows).toEqual([
      { holding_id: null, shares: null, cost_change: null, recurring_period: null, card_bill_id: null },
    ]);
  });

  it("外鍵：刪除持股時定期定額一起刪、買賣紀錄留著（holding_id 改成 null）；刪除投資帳戶時持股一起刪；刪除帳號時持股一起刪，別人的不受影響", async () => {
    const { early, boss } = OWNER_SUBQUERY_USERS;
    await insertUser(early, "early");
    await insertUser(boss, "boss");
    await migrate(db, { migrationsFolder: MIGRATIONS });
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
      return { deposit, broker, etf, tw50, rule, buy };
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

    await client.query(`delete from core_users where id = $1`, [early]);
    expect(await one(`select count(*)::int as n from "savings_holdings"`)).toEqual({ n: 0 });
  });
});

// v0.1.6 星穹鐵道的自動兌換 正式環境停在 v0.1.5 的 0009
const STARRAIL_AUTO_REDEEM = "0011_starrail_auto_redeem.sql";

describe("0011 星穹鐵道自動兌換：帳號加開關、新表記下試過的兌換碼（只擴充）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(11) });
  });

  const one = async <T>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows[0];
  const boss = OWNER_SUBQUERY_USERS.boss;

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的 starrail_accounts，等不到鎖就失敗、之後再重跑", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(11, 12);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只動星穹鐵道的表：新表開了 RLS、新欄位有預設值、沒有刪除、改名與 alter column；外鍵只指向 starrail_accounts", () => {
    const sql = readFileSync(path.join(MIGRATIONS, STARRAIL_AUTO_REDEEM), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    expect([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1])).toEqual(["starrail_redeem_codes"]);
    const touched = [...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX "\w+" ON) "(\w+)"/g)].map((m) => m[1]);
    expect(touched.filter((table) => !table.startsWith("starrail_"))).toEqual([]);
    const columns = [...sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)];
    expect(columns.map(([, name]) => name)).toEqual(["auto_redeem"]);
    for (const [, name, definition] of columns) expect(definition, name).toMatch(/DEFAULT/);
    expect([...sql.matchAll(/REFERENCES "public"\."(\w+)"/g)].map((m) => m[1])).toEqual(["starrail_accounts"]);
    expect(sql).toContain(`ALTER TABLE "starrail_redeem_codes" ENABLE ROW LEVEL SECURITY;`);
  });

  it("套用後舊程式（v0.1.5）連結帳號的 upsert 照常可用；不認得新欄位的寫法連結的帳號預設不自動兌換", async () => {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, 'boss', 'scrypt$x', 'owner')`, [boss]);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    const upsert = `insert into "starrail_accounts" ("id", "user_id", "ltuid", "cookie_encrypted", "uid", "nickname", "region", "level", "stamina_alert_threshold", "last_stamina_alert_at", "cookie_invalid", "created_at", "updated_at") values (default, $1, '42', 'v1:x', '900000001', '開拓者', 'prod_official_cht', 70, default, default, default, default, default) on conflict ("uid") do update set "user_id" = $1, "cookie_invalid" = false, "updated_at" = now()`;
    await client.query(upsert, [boss]);
    await client.query(upsert, [boss]);

    expect(await one(`select "auto_redeem", "cookie_invalid" from "starrail_accounts" where "uid" = '900000001'`)).toEqual({ auto_redeem: false, cookie_invalid: false });
  });

  it("同一個遊戲帳號同一個兌換碼只有一列；移除遊戲帳號、刪除帳號時試過的兌換碼一起刪", async () => {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, 'boss', 'scrypt$x', 'owner')`, [boss]);
    await migrate(db, { migrationsFolder: MIGRATIONS });
    const account = await one<{ id: number }>(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values ($1, '42', 'v1:x', '900000001', 'prod_official_cht') returning "id"`, [boss]);
    await client.query(`insert into "starrail_redeem_codes" ("account_id", "code", "result") values ($1, 'STARRAILGIFT', 'success')`, [account.id]);

    await expect(client.query(`insert into "starrail_redeem_codes" ("account_id", "code", "result") values ($1, 'STARRAILGIFT', 'already')`, [account.id])).rejects.toThrow();

    await client.query(`delete from core_users where id = $1`, [boss]);
    expect(await one(`select count(*)::int as n from "starrail_redeem_codes"`)).toEqual({ n: 0 });
  });
});

// v0.1.6 星穹鐵道每日 每週與終局提醒的開關 跟 0010 0011 一起上線 舊程式是 v0.1.5
const STARRAIL_GAME_REMINDERS = "0012_starrail_game_reminders.sql";

describe("0012 星穹鐵道的提醒開關：帳號加一個預設開著的欄位（只擴充）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(12) });
  });

  const boss = OWNER_SUBQUERY_USERS.boss;

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的 starrail_accounts，等不到鎖就失敗、之後再重跑", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(12, 13);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只在 starrail_accounts 加 game_reminders、有預設值；沒有刪除、改名與 alter column", () => {
    const sql = readFileSync(path.join(MIGRATIONS, STARRAIL_GAME_REMINDERS), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    expect([...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX "\w+" ON) "(\w+)"/g)].map((m) => m[1])).toEqual(["starrail_accounts"]);
    const columns = [...sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)];
    expect(columns.map(([, name]) => name)).toEqual(["game_reminders"]);
    for (const [, name, definition] of columns) expect(definition, name).toMatch(/DEFAULT/);
  });

  it("套用前就連結的帳號、套用後舊程式（v0.1.5）用它認得的欄位 upsert 的帳號_都照舊提醒", async () => {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, 'boss', 'scrypt$x', 'owner')`, [boss]);
    await client.query(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values ($1, '42', 'v1:x', '900000001', 'prod_official_cht')`, [boss]);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    const upsert = `insert into "starrail_accounts" ("id", "user_id", "ltuid", "cookie_encrypted", "uid", "nickname", "region", "level", "stamina_alert_threshold", "last_stamina_alert_at", "cookie_invalid", "created_at", "updated_at") values (default, $1, '43', 'v1:y', '900000002', '開拓者', 'prod_official_cht', 70, default, default, default, default, default) on conflict ("uid") do update set "user_id" = $1, "cookie_invalid" = false, "updated_at" = now()`;
    await client.query(upsert, [boss]);
    await client.query(upsert, [boss]);

    const { rows } = await client.query(`select "uid", "game_reminders" from "starrail_accounts" order by "uid"`);
    expect(rows).toEqual([
      { uid: "900000001", game_reminders: true },
      { uid: "900000002", game_reminders: true },
    ]);
  });
});

// v0.1.6 信用卡帳單 正式環境停在 v0.1.5 的 0009 會跟 0010 到 0012 一起套用
const FINANCE_CARD_BILLS = "0013_finance_card_bills.sql";

describe("0013 理財：信用卡帳單（只擴充）", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(13) });
  });

  const boss = OWNER_SUBQUERY_USERS.boss;
  const one = async <T>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows[0];

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的 savings_transactions、新表的外鍵要鎖 core_users，等不到鎖就失敗、之後再重跑", () => {
    const [migration] = readMigrationFiles({ migrationsFolder: MIGRATIONS }).slice(13, 14);

    expect(migration.sql[0].trim()).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("只動理財的表：新表 savings_card_bills 開了 RLS、紀錄多一個可為 null 的 card_bill_id；沒有刪除、改名與 alter column；外鍵只指向 core_users 與理財的表", () => {
    const sql = readFileSync(path.join(MIGRATIONS, FINANCE_CARD_BILLS), "utf8");

    expect(sql).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
    expect([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1])).toEqual(["savings_card_bills"]);
    const touched = [...sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX "\w+" ON) "(\w+)"/g)].map((m) => m[1]);
    expect(touched.filter((table) => !table.startsWith("savings_"))).toEqual([]);
    const columns = [...sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)];
    expect(columns.map(([, name]) => name)).toEqual(["card_bill_id"]);
    for (const [, name, definition] of columns) expect(definition, name).not.toMatch(/NOT NULL/);
    const referenced = [...sql.matchAll(/REFERENCES "public"\."(\w+)"/g)].map((m) => m[1]);
    expect(referenced.filter((table) => table !== "core_users" && !table.startsWith("savings_"))).toEqual([]);
    expect(sql).toContain(`ALTER TABLE "savings_card_bills" ENABLE ROW LEVEL SECURITY;`);
  });

  it("外鍵：刪掉帳單時補的那一筆紀錄留著（card_bill_id 改成 null）；刪掉卡或刪除帳號時帳單一起刪", async () => {
    await client.query(`insert into core_users (id, username, password_hash, role) values ($1, 'boss', 'scrypt$x', 'owner')`, [boss]);
    await migrate(db, { migrationsFolder: MIGRATIONS });
    const card = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "statement_day", "due_day") values ($1, '國泰卡', 'credit', 5, 20) returning "id"`, [boss]);
    const bill = await one<{ id: number }>(`insert into "savings_card_bills" ("user_id", "account_id", "statement_date", "due_date", "amount") values ($1, $2, '2026-10-05', '2026-10-20', 12480) returning "id"`, [boss, card.id]);
    const reconcile = await one<{ id: number }>(
      `insert into "savings_transactions" ("user_id", "kind", "account_id", "amount", "date", "note", "card_bill_id") values ($1, 'expense', $2, 9480, '2026-10-05', '未記錄的刷卡（帳單差額）', $3) returning "id"`,
      [boss, card.id, bill.id],
    );

    await client.query(`delete from "savings_card_bills" where "id" = $1`, [bill.id]);
    expect(await one(`select "card_bill_id", "amount" from "savings_transactions" where "id" = $1`, [reconcile.id])).toEqual({ card_bill_id: null, amount: 9480 });

    await client.query(`insert into "savings_card_bills" ("user_id", "account_id", "statement_date", "due_date", "amount") values ($1, $2, '2026-10-05', '2026-10-20', 12480)`, [boss, card.id]);
    await client.query(`delete from "savings_accounts" where "id" = $1`, [card.id]);
    expect(await one(`select count(*)::int as n from "savings_card_bills"`)).toEqual({ n: 0 });

    const another = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind") values ($1, '台新卡', 'credit') returning "id"`, [boss]);
    await client.query(`insert into "savings_card_bills" ("user_id", "account_id", "statement_date", "due_date", "amount") values ($1, $2, '2026-10-18', '2026-10-27', 3500)`, [boss, another.id]);
    await client.query(`delete from core_users where id = $1`, [boss]);
    expect(await one(`select count(*)::int as n from "savings_card_bills"`)).toEqual({ n: 0 });
  });
});
