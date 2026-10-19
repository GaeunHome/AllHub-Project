import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/core/auth/credentials";
import { deleteOwnAccount } from "@/core/auth/users";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";

// 刪除帳號跟各模組的資料表只靠外鍵連在一起
// core 不能 import 模組 所以跨模組的檢查放在 src 底下

const getDb = setupTestDb();
const PASSWORD = "correct horse battery staple";

let owner: string;
let member: string;

const first = async <T extends Record<string, unknown> = { id: number }>(query: SQL) => (await getDb().execute<T>(query)).rows[0];

type UserForeignKey = { table: string; column: string; onDelete: string; notNull: boolean };

/** 資料庫裡每個指向 core_users 的外鍵 新的表加了外鍵就會出現在這裡 不用改測試 */
async function userForeignKeys(): Promise<UserForeignKey[]> {
  const { rows } = await getDb().execute<UserForeignKey>(sql`
    select c.conrelid::regclass::text as "table", a.attname as "column",
      case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' when 'r' then 'restrict' else 'no action' end as "onDelete",
      a.attnotnull as "notNull"
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'core_users'::regclass
    order by 1, 2`);
  return rows;
}

const rowsOf = async ({ table, column }: UserForeignKey, userId: string) =>
  (await first<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${userId}`)).n;

/**
 * 一個人在每張有外鍵的表都留下資料 含理財的表彼此參照的列
 * 寫成 SQL 不靠 drizzle 的 schema 程式不再讀寫但還沒刪掉的舊表也照樣放
 */
async function seedEverything(userId: string, n: number) {
  const streamer = await first(sql`insert into twitch_streamers (broadcaster_id, login, display_name) values (${`b${n}`}, ${`streamer${n}`}, '主播') returning id`);
  await first(sql`insert into twitch_follows (user_id, streamer_id) values (${userId}, ${streamer.id})`);
  const channel = `UC${String(n).repeat(22)}`;
  await first(sql`insert into youtube_channels (channel_id, title) values (${channel}, '頻道')`);
  await first(sql`insert into youtube_follows (user_id, channel_id) values (${userId}, ${channel})`);
  await first(sql`insert into youtube_settings (user_id, provider, anthropic_key) values (${userId}, 'anthropic', 'v1:cipher')`);
  await first(sql`insert into youtube_translations (video_id, status, source_kind, source_cues, translated, batches, requested_by) values (${`video000000${n}`.slice(-11)}, 'done', 'manual', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${userId})`);
  // 兩個人都保留同一支影片 刪掉一個人的清單不影響另一個人
  await first(sql`insert into youtube_saved_videos (user_id, video_id, title, pinned) values (${userId}, 'dQw4w9WgXcQ', '影片', true)`);
  const game = await first(sql`insert into starrail_accounts (user_id, ltuid, cookie_encrypted, uid, region) values (${userId}, ${String(n)}, 'v1:cipher', ${`80000000${n}`}, 'prod_official_asia') returning id`);
  await first(sql`insert into starrail_checkin_logs (account_id, result) values (${game.id}, 'success')`);
  await first(sql`insert into starrail_redeem_codes (account_id, code, result) values (${game.id}, 'STARRAILGIFT', 'success')`);
  const category = await first(sql`insert into savings_categories (user_id, kind, name, color, monthly_budget) values (${userId}, 'expense', '餐飲', 'orange', 6000) returning id`);
  const deposit = await first(sql`insert into savings_accounts (user_id, name, kind, opening_balance) values (${userId}, '存款', 'deposit', 1000) returning id`);
  const card = await first(sql`insert into savings_accounts (user_id, name, kind, statement_day, pay_from_account_id, opening_balance) values (${userId}, '信用卡', 'credit', 5, ${deposit.id}, -500) returning id`);
  const broker = await first(sql`insert into savings_accounts (user_id, name, kind) values (${userId}, '證券', 'investment') returning id`);
  const rule = await first(sql`insert into savings_recurring (user_id, kind, account_id, category_id, amount, day_of_month) values (${userId}, 'expense', ${card.id}, ${category.id}, 390, 6) returning id`);
  const bill = await first(sql`insert into savings_card_bills (user_id, account_id, statement_date, due_date, amount) values (${userId}, ${card.id}, '2026-10-05', '2026-10-20', 890) returning id`);
  const etf = await first(sql`insert into savings_holdings (user_id, account_id, symbol, name, shares, cost) values (${userId}, ${broker.id}, '006208', '富邦台50', 10, 1200) returning id`);
  const regularBuy = await first(
    sql`insert into savings_recurring (user_id, kind, account_id, counter_account_id, amount, day_of_month, mode, holding_id) values (${userId}, 'transfer', ${deposit.id}, ${broker.id}, 1000, 5, 'confirm', ${etf.id}) returning id`,
  );
  await first(sql`insert into savings_transactions (user_id, kind, account_id, category_id, amount, date, recurring_id) values (${userId}, 'expense', ${card.id}, ${category.id}, 390, '2026-10-06', ${rule.id})`);
  await first(sql`insert into savings_transactions (user_id, kind, account_id, counter_account_id, amount, date) values (${userId}, 'transfer', ${deposit.id}, ${card.id}, 500, '2026-10-07')`);
  await first(sql`insert into savings_transactions (user_id, kind, account_id, amount, date, card_bill_id) values (${userId}, 'expense', ${card.id}, 500, '2026-10-05', ${bill.id})`);
  await first(
    sql`insert into savings_transactions (user_id, kind, account_id, counter_account_id, amount, date, holding_id, shares, cost_change, recurring_id, recurring_period) values (${userId}, 'transfer', ${deposit.id}, ${broker.id}, 1000, '2026-10-05', ${etf.id}, 8, 1000, ${regularBuy.id}, '2026-10-01')`,
  );
  await first(sql`insert into weather_settings (user_id, county) values (${userId}, '臺北市')`);
  await first(sql`insert into core_notifications (user_id, module, kind, title) values (${userId}, 'twitch', 'stream_online', '開台了')`);
  await first(sql`insert into core_invites (token_hash, created_by, expires_at, max_uses) values (${`hash${n}`}, ${userId}, ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz, 1)`);
}

beforeEach(async () => {
  [owner, member] = await insertTestUsers(getDb());
  await first(sql`update core_users set password_hash = ${await hashPassword(PASSWORD)} where id = ${member}`);
  await seedEverything(member, 1);
  await seedEverything(owner, 2);
});

describe("刪除自己的帳號：外鍵指向 core_users 的資料一起刪除，共用的翻譯留下但不再連到他", () => {
  it("外鍵的刪除規則：都是 on delete cascade、不能是空的，只有共用翻譯的發起人是 set null（發起人刪除帳號後是空的）", async () => {
    const keys = await userForeignKeys();

    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((key) => key.onDelete !== "cascade").map((key) => `${key.table}.${key.column}：${key.onDelete}`)).toEqual(["youtube_translations.requested_by：set null"]);
    expect(keys.filter((key) => !key.notNull).map((key) => `${key.table}.${key.column}`)).toEqual(["youtube_translations.requested_by"]);
  });

  it("每張有外鍵指向 core_users 的表都放了兩個人的測試資料（新的表要加進 seedEverything，下面的刪除檢查才涵蓋得到）", async () => {
    const missing: string[] = [];
    for (const key of await userForeignKeys()) {
      if ((await rowsOf(key, member)) === 0) missing.push(`${key.table}.${key.column}（成員）`);
      if ((await rowsOf(key, owner)) === 0) missing.push(`${key.table}.${key.column}（站長）`);
    }

    expect(missing).toEqual([]);
  });

  it("刪除後每張有外鍵的表裡都沒有他的列，別人的不受影響；簽到紀錄與試過的兌換碼跟著遊戲帳號刪", async () => {
    const keys = await userForeignKeys();
    const ownerRows = await Promise.all(keys.map((key) => rowsOf(key, owner)));

    expect(await deleteOwnAccount(member, PASSWORD)).toEqual({ ok: true });

    for (const [i, key] of keys.entries()) {
      expect(await rowsOf(key, member), `${key.table}.${key.column}`).toBe(0);
      expect(await rowsOf(key, owner), `${key.table}.${key.column}（站長的）`).toBe(ownerRows[i]);
    }
    expect(await first(sql`select (select count(*)::int from starrail_checkin_logs) as logs, (select count(*)::int from starrail_redeem_codes) as codes`)).toEqual({ logs: 1, codes: 1 });
  });

  it("他發起的翻譯留給其他人，發起人改成 null；共用的主播與頻道留著（沒人追蹤的由排程清掉）", async () => {
    await deleteOwnAccount(member, PASSWORD);

    const { rows } = await getDb().execute<{ requested_by: string | null }>(sql`select requested_by from youtube_translations order by video_id`);
    expect(rows.map((row) => row.requested_by)).toEqual([null, owner]);
    expect(await first(sql`select (select count(*)::int from twitch_streamers) as streamers, (select count(*)::int from youtube_channels) as channels`)).toEqual({ streamers: 2, channels: 2 });
  });
});
