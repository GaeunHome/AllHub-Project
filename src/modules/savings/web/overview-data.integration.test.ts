import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, insertTestUsers, setupTestDb } from "@/dev/test-db";
import { pgliteOf, savingsRows } from "../dev/db-fixtures";
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

const { insertAccount, insertRule, insertTransaction } = savingsRows(getDb, () => me, {
  account: { createdAt: new Date(CREATED) },
  rule: { mode: "confirm", createdAt: new Date(CREATED) },
});

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  ({ id: living } = await insertAccount({ name: "生活費帳戶", openingBalance: 50_000 }));
  // 結帳時欠 3,000 結帳後沒有新的紀錄
  ({ id: card } = await insertAccount({ name: "國泰卡", kind: "credit", statementDay: 5, payFromAccountId: living, openingBalance: -3000 }));
  ({ id: power } = await insertRule({ accountId: living, dayOfMonth: 5, amount: 1350, name: "電費", lastPostedMonth: "2026-09-01" }));
  ({ id: netflix } = await insertRule({ accountId: card, dayOfMonth: 12, amount: 390, name: "Netflix", mode: "auto", lastPostedMonth: "2026-09-01" }));
  ({ id: gym } = await insertRule({ accountId: living, dayOfMonth: 1, amount: 1200, name: "健身房", lastPostedMonth: "2026-09-01" }));
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
    await insertTransaction({ accountId: card, amount: 390, date: "2026-10-12", note: "Netflix", recurringId: netflix });
    // web 層不能 import 資料表 游標直接用 SQL 推
    await pgliteOf(getDb()).query(`update savings_recurring set last_posted_month = '2026-10-01' where id = $1`, [netflix]);

    expect((await view()).find(([key]) => key === `recurring:${netflix}:2026-10`)).toEqual([`recurring:${netflix}:2026-10`, "auto-done", 390, "2026-10-12", false]);
  });

  it("只讀自己的：別人的固定收支、卡與紀錄都不會出現；什麼都沒有的人是空的、configured 是 false", async () => {
    const { id: theirs } = await insertAccount({ name: "別人的帳戶", userId: other });
    const { id: theirRule } = await insertRule({ accountId: theirs, dayOfMonth: 5, amount: 999, name: "別人的", lastPostedMonth: "2026-10-01", userId: other });
    await insertTransaction({ accountId: theirs, amount: 999, date: "2026-10-05", recurringId: theirRule, recurringPeriod: "2026-10-01", userId: other });

    expect((await view()).map(([key]) => key)).not.toContain(`recurring:${theirRule}:2026-10`);
    expect(await view(other)).toEqual([[`recurring:${theirRule}:2026-10`, "done", 999, "2026-10-05", false]]);

    const fresh = await insertTestUser(getDb(), "carol");
    expect(await loadChecklist(fresh, NOW)).toMatchObject({ items: [], entries: [], configured: false });
  });
});
