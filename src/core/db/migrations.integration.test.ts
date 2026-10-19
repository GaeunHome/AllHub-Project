import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const BASELINE = "0000_baseline";
// 正式資料庫最後套用的 migration 的時間戳記
const LAST_APPLIED_BEFORE_BASELINE = 1792131927825;
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type Journal = { entries: { idx: number; when: number; tag: string }[] };
const journal = () => JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;

/** 只含前 count 個 migration 的資料夾 模擬正式資料庫還停在舊版 */
function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "allhub-migrations-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const entries = journal().entries.filter((entry) => entry.idx < count);
  writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal(), entries }));
  return dir;
}

let client: PGlite;
let db: ReturnType<typeof drizzle>;

// 啟動 PGlite 並套用 migration 要好幾秒 機器忙時更久
// 所以放在 hook 裡用 vitest.config 的 hookTimeout
beforeEach(async () => {
  client = new PGlite();
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
// 例外只有使用者同意這一版直接收斂 只放行這幾條 代價寫在 docs/deploy.md
const ALLOWED_CONVERGENCE: Record<string, string[]> = {
  "0001_weather_cleanup": [
    `ALTER TABLE "core_notifications" ALTER COLUMN "user_id" SET NOT NULL;`,
    `ALTER TABLE "starrail_accounts" ALTER COLUMN "user_id" SET NOT NULL;`,
    `ALTER TABLE "youtube_settings" ALTER COLUMN "user_id" SET NOT NULL;`,
    `DROP INDEX "core_notifications_unread_idx";`,
    `ALTER TABLE "savings_accounts" DROP CONSTRAINT "savings_accounts_purpose_id_savings_purposes_id_fk";`,
    `DROP INDEX "savings_accounts_purpose_id_idx";`,
    `ALTER TABLE "savings_accounts" DROP COLUMN "purpose_id";`,
    `DROP TABLE "savings_purposes";`,
    `ALTER TABLE "twitch_streamers" DROP COLUMN "notify_enabled";`,
    `ALTER TABLE "youtube_channels" DROP COLUMN "notify_enabled";`,
    `ALTER TABLE "youtube_settings" DROP COLUMN "anthropic_key_hint";`,
    `ALTER TABLE "youtube_settings" DROP COLUMN "openai_key_hint";`,
    `ALTER TABLE "youtube_settings" DROP COLUMN "gemini_key_hint";`,
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

// 正式資料庫停在基準檔 套用時線上可能還是上一版的程式
describe("0001 天氣與收斂：新增天氣的表，刪掉不再使用的欄位與表，依使用者的表 user_id 不能是空的", { timeout: 30_000 }, () => {
  const { boss, early } = USERS;

  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(1) });
    await insertUser(boss, "boss", "owner");
    await insertUser(early, "early");
  });

  it("沒有擁有者的列（多人化以前的舊程式寫的）先刪掉再改成 NOT NULL，有擁有者的不動；刪掉的遊戲帳號的簽到紀錄與兌換碼跟著刪，共用翻譯的發起人照舊可以是空的", async () => {
    await client.query(`insert into "core_notifications" ("user_id", "module", "kind", "title") values ($1, 'twitch', 'stream_online', '給 boss'), (null, 'twitch', 'stream_online', '沒有收件人')`, [boss]);
    const owned = await one<{ id: number }>(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values ($1, '1', 'v1:x', '800000001', 'prod_official_asia') returning "id"`, [boss]);
    const orphan = await one<{ id: number }>(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values (null, '2', 'v1:y', '800000002', 'prod_official_asia') returning "id"`);
    for (const { id } of [owned, orphan]) {
      await client.query(`insert into "starrail_checkin_logs" ("account_id", "result") values ($1, 'success')`, [id]);
      await client.query(`insert into "starrail_redeem_codes" ("account_id", "code", "result") values ($1, 'STARRAILGIFT', 'success')`, [id]);
    }
    // 單人版的那一列固定是 id 1
    await client.query(`insert into "youtube_settings" ("id", "user_id", "provider") values (1, null, 'gemini')`);
    await client.query(`insert into "youtube_settings" ("user_id", "provider") values ($1, 'openai')`, [early]);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    expect((await client.query(`select "user_id", "title" from "core_notifications"`)).rows).toEqual([{ user_id: boss, title: "給 boss" }]);
    expect((await client.query(`select "id" from "starrail_accounts"`)).rows).toEqual([{ id: owned.id }]);
    expect((await client.query(`select "account_id" from "starrail_checkin_logs"`)).rows).toEqual([{ account_id: owned.id }]);
    expect((await client.query(`select "account_id" from "starrail_redeem_codes"`)).rows).toEqual([{ account_id: owned.id }]);
    expect((await client.query(`select "user_id", "provider" from "youtube_settings"`)).rows).toEqual([{ user_id: early, provider: "openai" }]);
    const { rows: nullable } = await client.query(
      `select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in ('user_id', 'requested_by') and is_nullable = 'YES'`,
    );
    expect(nullable).toEqual([{ table_name: "youtube_translations", column_name: "requested_by" }]);
    await expect(client.query(`insert into "starrail_accounts" ("ltuid", "cookie_encrypted", "uid", "region") values ('3', 'v1:z', '800000003', 'prod_official_asia')`)).rejects.toThrow(/"user_id"/);
  });

  it("刪掉不再使用的欄位、表與索引：主播表與頻道表的舊通知開關、API Key 的末 4 碼、帳戶的用途 id 與用途表、沒有查詢用到的未讀索引（清理排程用的留著）；同一列的其他資料都在", async () => {
    const purpose = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '生活費', 'blue') returning "id"`, [boss]);
    await client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id", "label", "opening_balance") values ($1, '台銀', 'deposit', $2, '生活費', 1000)`, [boss, purpose.id]);
    await client.query(`insert into "twitch_streamers" ("broadcaster_id", "login", "display_name", "notify_enabled") values ('1035', 'alice', 'Alice', false)`);
    await client.query(`insert into "youtube_channels" ("channel_id", "title", "notify_enabled") values ('UCaaaaaaaaaaaaaaaaaaaaaa', '頻道 A', false)`);
    await client.query(`insert into "youtube_settings" ("user_id", "anthropic_key", "anthropic_key_hint") values ($1, 'v1:cipher', 'wxyz')`, [boss]);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const removed = ["twitch_streamers.notify_enabled", "youtube_channels.notify_enabled", "youtube_settings.anthropic_key_hint", "youtube_settings.openai_key_hint", "youtube_settings.gemini_key_hint", "savings_accounts.purpose_id"];
    const { rows: columns } = await client.query<{ name: string }>(`select table_name || '.' || column_name as name from information_schema.columns where table_schema = 'public'`);
    expect(columns.filter(({ name }) => removed.includes(name))).toEqual([]);
    expect(await one(`select to_regclass('public.savings_purposes') as purposes`)).toEqual({ purposes: null });
    expect((await client.query(`select indexname from pg_indexes where indexname in ('core_notifications_unread_idx', 'savings_accounts_purpose_id_idx', 'core_notifications_created_at_idx')`)).rows).toEqual([
      { indexname: "core_notifications_created_at_idx" },
    ]);
    expect(await one(`select "name", "label", "opening_balance" from "savings_accounts"`)).toEqual({ name: "台銀", label: "生活費", opening_balance: 1000 });
    expect(await one(`select "login" from "twitch_streamers"`)).toEqual({ login: "alice" });
    expect(await one(`select "title" from "youtube_channels"`)).toEqual({ title: "頻道 A" });
    expect(await one(`select "user_id", "anthropic_key" from "youtube_settings"`)).toEqual({ user_id: boss, anthropic_key: "v1:cipher" });
  });

  it("套用後 v0.1.7 的寫法：明列了刪掉的欄位就寫不進去（主播表、頻道表、翻譯設定、理財的帳戶；使用者同意的代價，新版部署好就沒事）；其他照舊，例如帶著擁有者寫通知與遊戲帳號", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });

    // drizzle 會明列它認得的每一個欄位 沒給值的寫 default
    const removedColumnWrites: [sql: string, params: unknown[], column: string][] = [
      [
        `insert into "twitch_streamers" ("id", "broadcaster_id", "login", "display_name", "profile_image_url", "online_subscription_id", "offline_subscription_id", "subscription_status", "is_live", "notify_enabled", "created_at") values (default, '1035', 'alice', 'Alice', null, null, null, null, default, default, default)`,
        [],
        "notify_enabled",
      ],
      [`insert into "youtube_channels" ("id", "channel_id", "title", "thumbnail", "lease_expires_at", "subscription_status", "notify_enabled", "created_at") values (default, 'UCaaaaaaaaaaaaaaaaaaaaaa', '頻道 A', null, null, null, default, default)`, [], "notify_enabled"],
      [
        `insert into "youtube_settings" ("id", "user_id", "provider", "anthropic_key", "anthropic_key_hint", "anthropic_model", "openai_key", "openai_key_hint", "openai_model", "gemini_key", "gemini_key_hint", "gemini_model", "glossary", "updated_at") values (default, $1, default, 'v1:cipher', 'wxyz', null, null, null, null, null, null, null, default, default)`,
        [boss],
        "anthropic_key_hint",
      ],
      [
        `insert into "savings_accounts" ("id", "user_id", "name", "kind", "purpose_id", "opening_balance", "opening_cost", "monthly_plan", "target_amount", "due_day", "pay_from_account_id", "active", "sort_order", "created_at", "statement_day", "autopay", "card_notified_on", "label", "card_style") values (default, $1, '台銀', 'deposit', null, 1000, null, null, null, null, null, default, default, default, null, default, null, '生活費', null)`,
        [boss],
        "purpose_id",
      ],
    ];
    for (const [text, params, column] of removedColumnWrites) await expect(client.query(text, params), column).rejects.toThrow(`column "${column}"`);

    await client.query(
      `insert into "core_notifications" ("id", "user_id", "module", "kind", "title", "body", "url", "created_at", "read_at") values (default, $1, 'twitch', 'stream_online', 'Alice 開台了', default, null, default, default)`,
      [early],
    );
    await client.query(
      `insert into "starrail_accounts" ("id", "user_id", "ltuid", "cookie_encrypted", "uid", "nickname", "region", "level", "stamina_alert_threshold", "last_stamina_alert_at", "cookie_invalid", "auto_redeem", "game_reminders", "created_at", "updated_at") values (default, $1, '42', 'v1:x', '900000001', null, 'prod_official_cht', null, null, null, default, default, default, default, default)`,
      [early],
    );
    expect(await one(`select "user_id", "module", "kind", "title", "body", "url", "read_at" from "core_notifications"`)).toEqual({ user_id: early, module: "twitch", kind: "stream_online", title: "Alice 開台了", body: "", url: null, read_at: null });
    expect(await one(`select "user_id", "uid", "cookie_invalid", "auto_redeem", "game_reminders" from "starrail_accounts"`)).toEqual({ user_id: early, uid: "900000001", cookie_invalid: false, auto_redeem: false, game_reminders: true });
  });

  it("天氣的表：每人一列，縣市只收 22 個縣市（「台」要寫成「臺」），下雨通知預設開", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '臺北市')`, [boss]);
    await expect(client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '台北市')`, [early])).rejects.toThrow(/weather_settings_county/);
    await expect(client.query(`insert into "weather_settings" ("user_id", "county") values ($1, '新北市')`, [boss])).rejects.toThrow(/weather_settings_pkey/);
    expect((await client.query(`select "user_id", "county", "rain_alert" from "weather_settings"`)).rows).toEqual([{ user_id: boss, county: "臺北市", rain_alert: true }]);
  });
});

// 刪除帳號時各表的外鍵 在 src/account-deletion.integration.test.ts 從資料庫的約束動態列出來檢查
describe("模組內資料之間的外鍵與唯一限制", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
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

  it("刪掉帳單時補的那一筆紀錄留著（card_bill_id 改成 null）；刪掉卡時帳單一起刪", async () => {
    const { boss } = USERS;
    await insertUser(boss, "boss", "owner");
    const card = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "statement_day") values ($1, '國泰卡', 'credit', 5) returning "id"`, [boss]);
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
  });
});
