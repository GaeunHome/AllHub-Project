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
const LAST_APPLIED_BEFORE_BASELINE = 1792073138959;
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
  const journalPath = path.join(dir, "meta/_journal.json");
  const entries = journal().entries.filter((entry) => entry.idx < count);
  writeFileSync(journalPath, JSON.stringify({ ...journal(), entries }));
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

describe("基準檔（v0.1.6 以前的 0000 到 0013 壓成一個）", { timeout: 30_000 }, () => {
  it("排在第一個，時間戳記等於壓縮前正式資料庫最後套用的 0013；之後的 migration 都比它晚（drizzle 只套時間比最後一筆晚的）", () => {
    const [first, ...rest] = journal().entries;

    expect(first).toMatchObject({ idx: 0, tag: BASELINE, when: LAST_APPLIED_BEFORE_BASELINE });
    for (const entry of rest) expect(entry.when, entry.tag).toBeGreaterThan(LAST_APPLIED_BEFORE_BASELINE);
  });

  it("正式資料庫（表都在、最後一筆是 0013）再跑 migrate 不會重跑基準檔，只套之後的", async () => {
    // 照正式資料庫的樣子 表已經建好 紀錄表只有最後一筆
    const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
    for (const statement of baseline.sql) await client.exec(statement);
    await client.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
    await client.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('0013', $1)`, [LAST_APPLIED_BEFORE_BASELINE]);

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
describe("基準檔之後的 migration 都只擴充", () => {
  const pending = journal().entries.filter((entry) => entry.tag !== BASELINE);

  it("一開始設 lock_timeout = 5s，而且是單獨一個 statement：要改既有的表或鎖 core_users，等不到鎖就失敗、之後再重跑，不讓線上的查詢排在後面卡住", () => {
    for (const { tag } of pending) expect(statementsOf(tag)[0], tag).toBe("SET LOCAL lock_timeout = '5s';");
  });

  it("沒有 drop、rename、alter column；新欄位是 NOT NULL 的一定有預設值；新表開了 RLS", () => {
    for (const { tag } of pending) {
      const sql = statementsOf(tag).join("\n");
      expect(sql, tag).not.toMatch(/\bdrop\b|\brename\b|alter column/i);
      for (const [, name, definition] of sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)) if (/NOT NULL/.test(definition)) expect(definition, `${tag} ${name}`).toMatch(/DEFAULT/);
      for (const [, table] of sql.matchAll(/CREATE TABLE "(\w+)"/g)) expect(sql, `${tag} ${table}`).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }
  });
});

// 正式資料庫停在基準檔 套用時線上還是上一版的程式 它的寫法要照常可用
describe("0001 理財改版：帳戶的用途文字與卡面顏色、分類的圖示（只擴充）", { timeout: 30_000 }, () => {
  const { boss, early } = USERS;

  beforeEach(async () => {
    await migrate(db, { migrationsFolder: migrationsUpTo(1) });
    await insertUser(boss, "boss", "owner");
    await insertUser(early, "early");
  });

  it("回填：帳戶的用途文字是原本用途的名稱（沒設用途的留空；信用卡沒有用途欄位，設了也不填），分類照名稱補上圖示（名稱不在圖示清單裡的留空）；卡面顏色都是空的", async () => {
    const living = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '生活費', 'blue') returning "id"`, [boss]);
    const reserve = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '緊急預備金', 'amber') returning "id"`, [early]);
    await client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id") values ($1, '台銀', 'deposit', $2), ($1, '證券', 'investment', null), ($1, '國泰卡', 'credit', $2)`, [boss, living.id]);
    await client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id") values ($1, '郵局', 'deposit', $2)`, [early, reserve.id]);
    await client.query(
      `insert into "savings_categories" ("user_id", "kind", "name", "color") values ($1, 'expense', '餐飲', 'orange'), ($1, 'income', '薪水', 'green'), ($1, 'expense', '提領現金', 'teal'), ($1, 'income', '其他', 'blue'), ($1, 'expense', '午餐', 'rose')`,
      [boss],
    );

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { rows: accounts } = await client.query(`select "name", "label", "card_style" from "savings_accounts" order by "id"`);
    expect(accounts).toEqual([
      { name: "台銀", label: "生活費", card_style: null },
      { name: "證券", label: null, card_style: null },
      { name: "國泰卡", label: null, card_style: null },
      { name: "郵局", label: "緊急預備金", card_style: null },
    ]);
    const { rows: categories } = await client.query(`select "name", "icon" from "savings_categories" order by "id"`);
    expect(categories).toEqual([
      { name: "餐飲", icon: "utensils" },
      { name: "薪水", icon: "briefcase" },
      { name: "提領現金", icon: "banknote" },
      { name: "其他", icon: "circle-dot" },
      { name: "午餐", icon: null },
    ]);
  });

  it("套用後 v0.1.6 的寫法照常可用：新增帳戶明列欄位而且帶用途 id、新增分類不給圖示、改帳戶與明列欄位的查詢；新欄位是空的", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    const purpose = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '生活費', 'blue') returning "id"`, [boss]);

    // drizzle 會明列它認得的每一個欄位 沒給值的寫 default
    const account = await one<{ id: number }>(
      `insert into "savings_accounts" ("id", "user_id", "name", "kind", "purpose_id", "opening_balance", "opening_cost", "monthly_plan", "target_amount", "due_day", "pay_from_account_id", "active", "sort_order", "created_at", "statement_day", "autopay", "card_notified_on") values (default, $1, '國泰', 'deposit', $2, 12000, null, 5000, 100000, null, null, default, default, default, null, default, null) returning "id"`,
      [boss, purpose.id],
    );
    await client.query(`insert into "savings_categories" ("id", "user_id", "kind", "name", "color", "monthly_budget", "sort_order", "created_at") values (default, $1, 'expense', '早餐', 'orange', null, default, default)`, [boss]);
    await client.query(`update "savings_accounts" set "name" = '國泰世華', "purpose_id" = $2, "opening_balance" = 13000 where "id" = $1 and "user_id" = $3`, [account.id, purpose.id, boss]);

    expect(await one(`select "id", "name", "purpose_id", "opening_balance" from "savings_accounts" where "id" = $1`, [account.id])).toEqual({ id: account.id, name: "國泰世華", purpose_id: purpose.id, opening_balance: 13000 });
    expect(await one(`select "label", "card_style" from "savings_accounts" where "id" = $1`, [account.id])).toEqual({ label: null, card_style: null });
    expect(await one(`select "name", "icon" from "savings_categories"`)).toEqual({ name: "早餐", icon: null });
  });

  it("卡面顏色只有信用卡能設，而且只能是那六種", async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await expect(client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "card_style") values ($1, '台銀', 'deposit', 'blue')`, [boss])).rejects.toThrow(/savings_accounts_card_style/);
    await expect(client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "card_style") values ($1, '證券', 'investment', 'green')`, [boss])).rejects.toThrow(/savings_accounts_card_style/);
    await expect(client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "card_style") values ($1, '國泰卡', 'credit', 'gold')`, [boss])).rejects.toThrow(/savings_accounts_card_style/);
    for (const [name, style] of [["藍卡", "blue"], ["綠卡", "green"], ["紫卡", "purple"], ["橘卡", "orange"], ["黑卡", "black"], ["銀卡", "silver"]]) {
      await client.query(`insert into "savings_accounts" ("user_id", "name", "kind", "card_style") values ($1, $2, 'credit', $3)`, [boss, name, style]);
    }
    await client.query(`insert into "savings_accounts" ("user_id", "name", "kind") values ($1, '沒選顏色的卡', 'credit')`, [boss]);
    expect(await one(`select count(*)::int as n from "savings_accounts"`)).toEqual({ n: 7 });
  });
});

describe("刪除帳號與資料之間的外鍵", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("刪除帳號時依使用者的資料一起刪除；共用的翻譯留下、發起人改成 null，主播與頻道也留著（沒人追蹤的由每天的排程清掉）", async () => {
    const { early, boss } = USERS;
    await insertUser(boss, "boss", "owner");
    await insertUser(early, "early");
    const streamer = await one<{ id: number }>(`insert into "twitch_streamers" ("broadcaster_id", "login", "display_name") values ('1035', 'alice', 'Alice') returning "id"`);
    await client.query(`insert into "youtube_channels" ("channel_id", "title") values ('UCaaaaaaaaaaaaaaaaaaaaaa', '頻道 A')`);
    for (const user of [boss, early]) {
      await client.query(`insert into "twitch_follows" ("user_id", "streamer_id") values ($1, $2)`, [user, streamer.id]);
      await client.query(`insert into "youtube_follows" ("user_id", "channel_id") values ($1, 'UCaaaaaaaaaaaaaaaaaaaaaa')`, [user]);
      await client.query(`insert into "youtube_saved_videos" ("user_id", "video_id", "pinned") values ($1, 'abcdefghijk', true)`, [user]);
      await client.query(`insert into "core_notifications" ("user_id", "module", "kind", "title") values ($1, 'twitch', 'stream_online', 'Alice 開台了')`, [user]);
    }
    await client.query(`insert into "youtube_settings" ("user_id", "provider") values ($1, 'anthropic')`, [boss]);
    await client.query(`insert into "starrail_accounts" ("user_id", "ltuid", "cookie_encrypted", "uid", "region") values ($1, '42', 'v1:x', '900000001', 'prod_official_cht')`, [boss]);
    await client.query(
      `insert into "youtube_translations" ("video_id", "status", "source_kind", "source_cues", "translated", "batches", "requested_by") values ('abcdefghijk', 'done', 'manual', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $1)`,
      [boss],
    );

    await client.query(`delete from core_users where id = $1`, [boss]);

    for (const table of ["twitch_follows", "youtube_follows", "youtube_saved_videos", "core_notifications", "youtube_settings", "starrail_accounts"]) {
      expect((await client.query(`select count(*)::int as n from "${table}" where "user_id" = $1`, [boss])).rows, table).toEqual([{ n: 0 }]);
    }
    expect(await one(`select count(*)::int as n from "twitch_follows" where "user_id" = $1`, [early])).toEqual({ n: 1 });
    expect(await one(`select "video_id", "requested_by" from "youtube_translations"`)).toEqual({ video_id: "abcdefghijk", requested_by: null });
    expect(await one(`select (select count(*)::int from twitch_streamers) as streamers, (select count(*)::int from youtube_channels) as channels`)).toEqual({ streamers: 1, channels: 1 });
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

  /**
   * 一個人在每張理財的表各留下資料
   * 含彼此參照的外鍵 用途 分類 扣款帳戶 轉帳的另一邊 固定收支
   */
  async function seedFinance(userId: string, prefix: string) {
    const purpose = await one<{ id: number }>(`insert into "savings_purposes" ("user_id", "name", "color") values ($1, '生活費', 'blue') returning "id"`, [userId]);
    const category = await one<{ id: number }>(`insert into "savings_categories" ("user_id", "kind", "name", "color", "monthly_budget") values ($1, 'expense', '餐飲', 'orange', 6000) returning "id"`, [userId]);
    const deposit = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "purpose_id", "opening_balance") values ($1, $2, 'deposit', $3, 1000) returning "id"`, [
      userId,
      `${prefix}存款`,
      purpose.id,
    ]);
    const card = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind", "statement_day", "pay_from_account_id", "opening_balance") values ($1, $2, 'credit', 5, $3, -500) returning "id"`, [
      userId,
      `${prefix}信用卡`,
      deposit.id,
    ]);
    const rule = await one<{ id: number }>(`insert into "savings_recurring" ("user_id", "kind", "account_id", "category_id", "amount", "day_of_month") values ($1, 'expense', $2, $3, 390, 6) returning "id"`, [
      userId,
      card.id,
      category.id,
    ]);
    await client.query(
      `insert into "savings_transactions" ("user_id", "kind", "account_id", "counter_account_id", "category_id", "amount", "date", "recurring_id") values ($1, 'expense', $2, null, $3, 390, '2026-10-06', $4), ($1, 'transfer', $5, $2, null, 500, '2026-10-07', null)`,
      [userId, card.id, category.id, rule.id, deposit.id],
    );
    const broker = await one<{ id: number }>(`insert into "savings_accounts" ("user_id", "name", "kind") values ($1, $2, 'investment') returning "id"`, [userId, `${prefix}證券`]);
    await client.query(`insert into "savings_holdings" ("user_id", "account_id", "symbol", "name", "shares", "cost") values ($1, $2, '006208', '富邦台50', 10, 1200)`, [userId, broker.id]);
    await client.query(`insert into "savings_card_bills" ("user_id", "account_id", "statement_date", "due_date", "amount") values ($1, $2, '2026-10-05', '2026-10-20', 890)`, [userId, card.id]);
  }

  const FINANCE_TABLES = ["savings_accounts", "savings_card_bills", "savings_categories", "savings_holdings", "savings_purposes", "savings_recurring", "savings_transactions"];
  const countOf = async (table: string, userId: string) => (await one<{ n: number }>(`select count(*)::int as n from "${table}" where "user_id" = $1`, [userId])).n;

  it("刪除帳號時理財的資料一起刪除（外鍵 cascade，含彼此參照的列）；別人的不受影響", async () => {
    const { early, boss } = USERS;
    await insertUser(early, "early");
    await insertUser(boss, "boss");
    await seedFinance(early, "早");
    await seedFinance(boss, "老闆");

    await client.query(`delete from core_users where id = $1`, [boss]);

    for (const table of FINANCE_TABLES) {
      expect(await countOf(table, boss), table).toBe(0);
      expect(await countOf(table, early), `${table}（別人的）`).toBeGreaterThan(0);
    }
    expect(await countOf("savings_transactions", early)).toBe(2);
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
