import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { enterCardBill, payCard } from "../service/cards";
import { confirmOccurrence, postDueRecurring, skipOccurrence } from "../service/recurring";
import { loadChecklist } from "./overview-data";

// 這個月要做的事接上真的資料庫 確認 略過 排程自動記帳 填帳單與繳卡費之後跟著變
const getDb = setupTestDb();
let me: string;
let other: string;

// 台北時間 2026-10-16 週五中午
const NOW = new Date("2026-10-16T04:00:00Z");
// 帳戶與固定收支都是台北 8/1 上午建立的
const CREATED = "2026-08-01T02:00:00Z";

let living: number;
let card: number;
let power: number;
let netflix: number;
let gym: number;

// web 層不能 import 資料表 直接用 SQL 準備資料
const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;
const query = (text: string, params: unknown[] = []) => pgliteOf(getDb()).query<{ id: number }>(text, params);

async function insertAccount(userId: string, name: string, extra = "", values: unknown[] = []) {
  const columns = extra ? `, ${extra}` : "";
  const placeholders = values.map((_, i) => `, $${i + 4}`).join("");
  const { rows } = await query(`insert into savings_accounts (user_id, name, created_at${columns}) values ($1, $2, $3${placeholders}) returning id`, [userId, name, CREATED, ...values]);
  return rows[0].id;
}

async function insertRule(userId: string, values: { accountId: number; dayOfMonth: number; amount: number; name: string; mode?: "auto" | "confirm"; lastPostedMonth: string }) {
  const { rows } = await query(
    `insert into savings_recurring (user_id, kind, account_id, day_of_month, amount, name, mode, last_posted_month, created_at) values ($1, 'expense', $2, $3, $4, $5, $6, $7, $8) returning id`,
    [userId, values.accountId, values.dayOfMonth, values.amount, values.name, values.mode ?? "confirm", values.lastPostedMonth, CREATED],
  );
  return rows[0].id;
}

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  living = await insertAccount(me, "生活費帳戶", "kind, opening_balance", ["deposit", 50_000]);
  // 結帳時欠 3,000 結帳後沒有新的紀錄
  card = await insertAccount(me, "國泰卡", "kind, statement_day, pay_from_account_id, opening_balance", ["credit", 5, living, -3000]);
  power = await insertRule(me, { accountId: living, dayOfMonth: 5, amount: 1350, name: "電費", lastPostedMonth: "2026-09-01" });
  netflix = await insertRule(me, { accountId: card, dayOfMonth: 12, amount: 390, name: "Netflix", mode: "auto", lastPostedMonth: "2026-09-01" });
  gym = await insertRule(me, { accountId: living, dayOfMonth: 1, amount: 1200, name: "健身房", lastPostedMonth: "2026-09-01" });
});

const view = async (userId = me) => {
  const checklist = await loadChecklist(userId, NOW);
  return checklist.items.map((item) => [item.key, item.state, item.amount, item.doneOn, item.actionable]);
};

describe("loadChecklist（總覽的這個月要做的事）", () => {
  it("還沒處理：卡要填帳單、電費與健身房逾期、Netflix 等排程自動記帳；按得了的列都有視窗的內容（key 一樣）", async () => {
    const checklist = await loadChecklist(me, NOW);

    expect(checklist.items.map((item) => [item.key, item.state, item.amount, item.actionable])).toEqual([
      [`recurring:${gym}:2026-10`, "overdue", 1200, true],
      [`card:${card}:2026-10-05`, "todo", 3000, true],
      [`recurring:${power}:2026-10`, "overdue", 1350, true],
      [`recurring:${netflix}:2026-10`, "auto", 390, false],
    ]);
    expect(checklist.entries.map((entry) => entry.row.key).sort()).toEqual(checklist.items.filter((item) => item.actionable).map((item) => item.key).sort());
    expect(checklist.configured).toBe(true);
  });

  it("確認電費（記 1,412）、略過健身房、排程記好 Netflix 之後_各自變成完成、已略過、自動記好，寫實際的金額與日期", async () => {
    await confirmOccurrence(me, { ruleId: String(power), period: "2026-10", amount: "1,412", date: "2026-10-16", note: "", shares: "" }, NOW);
    await skipOccurrence(me, { ruleId: String(gym), period: "2026-10" }, NOW);
    await postDueRecurring(NOW);

    expect(await view()).toEqual([
      [`recurring:${gym}:2026-10`, "skipped", 1200, null, false],
      [`card:${card}:2026-10-05`, "todo", 3000, null, true],
      [`recurring:${power}:2026-10`, "done", 1412, "2026-10-16", false],
      [`recurring:${netflix}:2026-10`, "auto-done", 390, "2026-10-12", false],
    ]);
  });

  it("填了帳單（4,200、截止 10/20）變成待繳；繳清之後是完成，寫繳款的那天", async () => {
    await enterCardBill(me, { cardId: String(card), amount: "4,200", statementDate: "", dueDate: "2026-10-20", categoryId: "" }, NOW);
    expect((await view()).find(([key]) => key === `card:${card}:2026-10-05`)).toEqual([`card:${card}:2026-10-05`, "todo", 4200, null, true]);

    await payCard(me, { cardId: String(card), fromAccountId: String(living), amount: "4,200", date: "2026-10-16" }, NOW);
    expect((await view()).find(([key]) => key === `card:${card}:2026-10-05`)).toEqual([`card:${card}:2026-10-05`, "done", 4200, "2026-10-16", false]);
  });

  it("沒有期別的舊自動紀錄_照日期對得到", async () => {
    await query(`insert into savings_transactions (user_id, kind, account_id, amount, date, note, recurring_id) values ($1, 'expense', $2, 390, '2026-10-12', 'Netflix', $3)`, [me, card, netflix]);
    await query(`update savings_recurring set last_posted_month = '2026-10-01' where id = $1`, [netflix]);

    expect((await view()).find(([key]) => key === `recurring:${netflix}:2026-10`)).toEqual([`recurring:${netflix}:2026-10`, "auto-done", 390, "2026-10-12", false]);
  });

  it("只讀自己的：別人的固定收支、卡與紀錄都不會出現；什麼都沒有的人是空的、configured 是 false", async () => {
    const theirs = await insertAccount(other, "別人的帳戶", "kind", ["deposit"]);
    const theirRule = await insertRule(other, { accountId: theirs, dayOfMonth: 5, amount: 999, name: "別人的", lastPostedMonth: "2026-10-01" });
    await query(`insert into savings_transactions (user_id, kind, account_id, amount, date, recurring_id, recurring_period) values ($1, 'expense', $2, 999, '2026-10-05', $3, '2026-10-01')`, [other, theirs, theirRule]);

    expect((await view()).map(([key]) => key)).not.toContain(`recurring:${theirRule}:2026-10`);
    expect(await view(other)).toEqual([[`recurring:${theirRule}:2026-10`, "done", 999, "2026-10-05", false]]);

    const fresh = await insertTestUser(getDb(), "carol");
    expect(await loadChecklist(fresh, NOW)).toMatchObject({ items: [], entries: [], configured: false });
  });
});
