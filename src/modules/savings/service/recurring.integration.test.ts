import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, onTestFinished, vi, type MockInstance } from "vitest";
import { coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsRecurring, savingsTransactions } from "../data/schema";
import { SavingsUserError } from "./errors";
import { createRecurring, deleteRecurring, listRecurring, postDueRecurring, setRecurringActive, updateRecurring, type RecurringFields } from "./recurring";

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

// 台北時間 2026-10-14 中午
const NOW = new Date("2026-10-14T04:00:00Z");
/** 台北時間那天中午 */
const noonOf = (date: string) => new Date(`${date}T04:00:00Z`);
// 建立帳戶那天之前不記帳 測其他規則時帳戶預設很早就開始記帳
// 用固定的日期 不跟著真的時鐘
const LONG_AGO = noonOf("2020-01-01");
const SKIPPED = (count: number) => `略過 ${count} 筆（帳戶或固定收支已停用，或早於帳戶開始記帳）`;

const NOT_FOUND = "找不到這個固定收支，可能已經刪除了";
const ACCOUNT_NOT_FOUND = "找不到這個帳戶，可能已經刪除了";
const CATEGORY_NOT_FOUND = "找不到這個分類，可能已經刪除了";
const INACTIVE = "這個帳戶已停用，請先恢復";
const KIND_MISMATCH = "分類跟收支類型不符";

async function insertAccount(values: Partial<typeof savingsAccounts.$inferInsert> & { name: string }) {
  const [row] = await getDb().insert(savingsAccounts).values({ userId: me, kind: "deposit", createdAt: LONG_AGO, ...values }).returning();
  return row;
}

async function insertCategory(values: { name: string; kind?: "income" | "expense"; userId?: string }) {
  const [row] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", color: "violet", ...values }).returning();
  return row;
}

async function insertRule(values: Partial<typeof savingsRecurring.$inferInsert> & { accountId: number; dayOfMonth: number }) {
  const [row] = await getDb().insert(savingsRecurring).values({ userId: me, kind: "expense", amount: 100, ...values }).returning();
  return row;
}

/** 要是使用者錯誤畫面才會顯示訊息 不能是文字剛好一樣的其他錯誤 */
async function userError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SavingsUserError);
  return (error as Error).message;
}

const rules = () => getDb().select().from(savingsRecurring).orderBy(asc(savingsRecurring.id));
const ruleOf = async (id: number) => (await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, id)))[0];
const transactions = () => getDb().select().from(savingsTransactions).orderBy(asc(savingsTransactions.id));

/** 原本的測試都是自動記帳的固定收支 新欄位給舊資料的值 */
const fields = (values: Partial<RecurringFields> = {}): RecurringFields => ({
  kind: "expense",
  accountId: "",
  counterAccountId: "",
  categoryId: "",
  amount: "390",
  dayOfMonth: "6",
  note: "",
  name: "",
  intervalMonths: "1",
  startMonth: "",
  holidayRule: "none",
  mode: "auto",
  holdingId: "",
  allocate: "",
  ...values,
});

/** 取 setupTestDb 底下的 PGlite 因為 TestDb 的型別沒有列出 drizzle 的 $client */
const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;
/**
 * 正式環境經 drizzle 的 postgres-js 收到 Date 參數會丟錯
 * 測試的 PGlite 自己會轉而查不出來 所以直接看送出的參數
 */
const dateParams = (query: MockInstance) => query.mock.calls.flatMap(([, params]) => (Array.isArray(params) ? params : [])).filter((param) => param instanceof Date);

/** 記下送出的每一句 SQL 與交易的開始 */
function logQueries(): string[] {
  const queries: string[] = [];
  const pglite = pgliteOf(testDb);
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    queries.push("begin");
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (query) => queries.push(query) } });
  return queries;
}

/** 同 logQueries 另外記下參數 交易的開始記成 sql 是 begin 的一筆 */
function logStatements(): { sql: string; params: unknown[] }[] {
  const statements: { sql: string; params: unknown[] }[] = [];
  const pglite = pgliteOf(testDb);
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    statements.push({ sql: "begin", params: [] });
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (sql, params) => statements.push({ sql, params }) } });
  return statements;
}

describe("listRecurring", () => {
  it("只有自己的_依每月的日期、同一天再依建立順序_停用的也列出", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirs = await insertAccount({ name: "別人的", userId: other });
    const rent = await insertRule({ accountId: cathay.id, dayOfMonth: 25, note: "房租" });
    const netflix = await insertRule({ accountId: cathay.id, dayOfMonth: 6, note: "Netflix", active: false });
    const spotify = await insertRule({ accountId: cathay.id, dayOfMonth: 6, note: "Spotify" });
    await insertRule({ userId: other, accountId: theirs.id, dayOfMonth: 1 });

    expect((await listRecurring(me)).map((r) => r.id)).toEqual([netflix.id, spotify.id, rent.id]);
    expect(await listRecurring(other)).toHaveLength(1);
  });
});

describe("createRecurring", () => {
  it("每月 6 日的支出_從建立的時間起算、還沒記過", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const subscription = await insertCategory({ name: "訂閱" });

    const rule = await createRecurring(me, fields({ accountId: String(cathay.id), categoryId: String(subscription.id), note: "Netflix" }), NOW);

    expect(rule).toMatchObject({
      userId: me,
      kind: "expense",
      accountId: cathay.id,
      counterAccountId: null,
      categoryId: subscription.id,
      amount: 390,
      dayOfMonth: 6,
      note: "Netflix",
      active: true,
      lastPostedMonth: null,
      createdAt: NOW,
    });
  });

  it("每月轉帳（定期定額）_送來的分類忽略", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const subscription = await insertCategory({ name: "訂閱" });

    expect(await createRecurring(me, fields({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(broker.id), categoryId: String(subscription.id), amount: "5000", dayOfMonth: "10" }), NOW)).toMatchObject({
      kind: "transfer",
      counterAccountId: broker.id,
      categoryId: null,
      amount: 5000,
      dayOfMonth: 10,
    });
  });

  it("日期不對_丟使用者錯誤_沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(createRecurring(me, fields({ accountId: String(cathay.id), dayOfMonth: "32" }), NOW))).toBe("每月的日期要在 1 到 31 日之間");
    expect(await rules()).toEqual([]);
  });

  it("帳戶不存在、帳戶或轉入帳戶停用_丟使用者錯誤_沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });

    expect(await userError(createRecurring(me, fields({ accountId: "999" }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(createRecurring(me, fields({ accountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await userError(createRecurring(me, fields({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await rules()).toEqual([]);
  });

  it("分類不存在或跟收支類型不符_丟使用者錯誤", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const salary = await insertCategory({ name: "薪水", kind: "income" });

    expect(await userError(createRecurring(me, fields({ accountId: String(cathay.id), categoryId: "999" }), NOW))).toBe(CATEGORY_NOT_FOUND);
    expect(await userError(createRecurring(me, fields({ accountId: String(cathay.id), categoryId: String(salary.id) }), NOW))).toBe(KIND_MISMATCH);
    expect(await rules()).toEqual([]);
  });
});

describe("updateRecurring", () => {
  it("改金額、日期、備註，支出改成轉帳_建立時間與記到的月份不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const createdAt = noonOf("2026-03-01");
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt, lastPostedMonth: "2026-09-01" });

    const updated = await updateRecurring(me, rule.id, fields({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(broker.id), amount: "3000", dayOfMonth: "15", note: "定期定額" }));

    expect(updated).toMatchObject({ id: rule.id, kind: "transfer", counterAccountId: broker.id, amount: 3000, dayOfMonth: 15, note: "定期定額", createdAt, lastPostedMonth: "2026-09-01" });
  });

  it("帳戶已經停用的固定收支_照樣可以改；改到另一個停用的帳戶_請先恢復", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const alsoClosed = await insertAccount({ name: "另一個舊帳戶", active: false });
    const rule = await insertRule({ accountId: closed.id, dayOfMonth: 6 });

    expect((await updateRecurring(me, rule.id, fields({ accountId: String(closed.id), amount: "500" }))).amount).toBe(500);
    expect(await userError(updateRecurring(me, rule.id, fields({ accountId: String(alsoClosed.id) })))).toBe(INACTIVE);
    expect((await ruleOf(rule.id)).accountId).toBe(closed.id);
  });

  it("輸入不合法_丟使用者錯誤_資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6, amount: 390 });

    expect(await userError(updateRecurring(me, rule.id, fields({ accountId: String(cathay.id), amount: "0" })))).toBe("金額至少 1 元");
    expect((await ruleOf(rule.id)).amount).toBe(390);
  });

  it.each([999, 2_147_483_648])("固定收支 %i 不存在_找不到", async (id) => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(updateRecurring(me, id, fields({ accountId: String(cathay.id) })))).toBe(NOT_FOUND);
  });
});

describe("setRecurringActive 與 deleteRecurring", () => {
  it("停用後再恢復", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6 });

    await setRecurringActive(me, rule.id, false);
    expect((await ruleOf(rule.id)).active).toBe(false);
    await setRecurringActive(me, rule.id, true);
    expect((await ruleOf(rule.id)).active).toBe(true);
  });

  it.each([999, 2_147_483_648])("停用不存在的固定收支 %i_找不到", async (id) => {
    expect(await userError(setRecurringActive(me, id, false))).toBe(NOT_FOUND);
  });

  it("刪掉_已經自動記的紀錄留著，只是不再標自動", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6 });
    await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: cathay.id, amount: 100, date: "2026-10-06", recurringId: rule.id });

    expect(await deleteRecurring(me, rule.id)).toBe(true);

    expect(await rules()).toEqual([]);
    expect((await transactions()).map((t) => [t.amount, t.recurringId])).toEqual([[100, null]]);
  });

  it.each([999, 2_147_483_648])("刪除不存在的固定收支 %i_回傳 false", async (id) => {
    expect(await deleteRecurring(me, id)).toBe(false);
  });
});

describe("每個人只看得到、改得到自己的固定收支", () => {
  it("新增時用別人的帳戶、別人的轉入帳戶或別人的分類_當作找不到，沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirCategory = await insertCategory({ name: "別人的", userId: other });

    expect(await userError(createRecurring(me, fields({ accountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(createRecurring(me, fields({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(createRecurring(me, fields({ accountId: String(cathay.id), categoryId: String(theirCategory.id) }), NOW))).toBe(CATEGORY_NOT_FOUND);
    expect(await rules()).toEqual([]);
  });

  it("修改、停用別人的固定收支_當作找不到，資料不變", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 6, amount: 100 });

    expect(await userError(updateRecurring(me, theirs.id, fields({ accountId: String(theirAccount.id), amount: "1" })))).toBe(NOT_FOUND);
    expect(await userError(setRecurringActive(me, theirs.id, false))).toBe(NOT_FOUND);
    expect(await ruleOf(theirs.id)).toMatchObject({ amount: 100, active: true });
  });

  it("把自己的固定收支改到別人的帳戶、別人的轉入帳戶或別人的分類_當作找不到，資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirCategory = await insertCategory({ name: "別人的", userId: other });
    const mine = await insertRule({ accountId: cathay.id, dayOfMonth: 6 });

    expect(await userError(updateRecurring(me, mine.id, fields({ accountId: String(theirAccount.id) })))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(updateRecurring(me, mine.id, fields({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(theirAccount.id) })))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(updateRecurring(me, mine.id, fields({ accountId: String(cathay.id), categoryId: String(theirCategory.id) })))).toBe(CATEGORY_NOT_FOUND);
    expect(await ruleOf(mine.id)).toMatchObject({ kind: "expense", accountId: cathay.id, counterAccountId: null, categoryId: null });
  });

  it("刪除別人的固定收支_回傳 false，還在", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 6 });

    expect(await deleteRecurring(me, theirs.id)).toBe(false);
    expect(await ruleOf(theirs.id)).toBeDefined();
  });
});

describe("postDueRecurring（排程 savings:recurring）", () => {
  it("到期的固定收支記成紀錄（日期是排定的那天、標上是哪一條）_記到的月份往前推_摘要只有筆數、沒有名稱與金額", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const subscription = await insertCategory({ name: "訂閱" });
    const netflix = await insertRule({ accountId: cathay.id, categoryId: subscription.id, amount: 390, dayOfMonth: 6, note: "Netflix", createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    const invest = await insertRule({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, amount: 5000, dayOfMonth: 10, createdAt: noonOf("2026-10-01") });
    const bonus = await insertRule({ kind: "income", accountId: cathay.id, amount: 777, dayOfMonth: 25, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });

    const summary = await postDueRecurring(NOW);

    expect(summary).toBe("自動記帳 2 筆");
    expect(summary).not.toMatch(/Netflix|390|5000|國泰/);
    expect((await transactions()).map((t) => [t.userId, t.kind, t.accountId, t.counterAccountId, t.categoryId, t.amount, t.date, t.note, t.recurringId])).toEqual([
      [me, "expense", cathay.id, null, subscription.id, 390, "2026-10-06", "Netflix", netflix.id],
      [me, "transfer", cathay.id, broker.id, null, 5000, "2026-10-10", null, invest.id],
    ]);
    expect((await rules()).map((r) => [r.id, r.lastPostedMonth])).toEqual([
      [netflix.id, "2026-10-01"],
      [invest.id, "2026-10-01"],
      [bonus.id, "2026-09-01"],
    ]);
  });

  it("排程在台北 00:30 跑（UTC 前一天 16:30）_當天的固定收支就會記", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });

    expect(await postDueRecurring(new Date("2026-10-05T16:30:00Z"))).toBe("自動記帳 1 筆");
    expect((await transactions())[0].date).toBe("2026-10-06");
  });

  it("漏掉好幾個月_各月補記一筆（沒有那天的記在月底）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 31, createdAt: noonOf("2026-06-15") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 4 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
  });

  it("漏掉超過 12 個月_只補最近 12 個月", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 1, createdAt: noonOf("2025-01-01") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 12 筆");
    const dates = (await transactions()).map((t) => t.date);
    expect([dates[0], dates.at(-1), dates.length]).toEqual(["2025-11-01", "2026-10-01", 12]);
  });

  it("建立那天之前的日期不補記_從下一次開始", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: NOW });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await postDueRecurring(noonOf("2026-11-06"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-11-06"]);
  });

  it("再跑一次_不會重複記", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 3 筆");
    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await transactions()).toHaveLength(3);
  });

  it("同時跑兩次（排程重送）_同一條同一個月只記一次", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-08-01") });
    await insertRule({ accountId: cathay.id, dayOfMonth: 1, createdAt: noonOf("2026-10-01") });

    const summaries = await Promise.all([postDueRecurring(NOW), postDueRecurring(NOW)]);

    expect(summaries.map((s) => Number(/自動記帳 (\d+) 筆/.exec(s)?.[1])).reduce((a, b) => a + b, 0)).toBe(4);
    const posted = (await transactions()).map((t) => `${t.recurringId}:${t.date}`);
    expect(posted).toHaveLength(4);
    expect(new Set(posted).size).toBe(4);
  });

  it("帳戶停用的固定收支_略過但往前推_恢復帳戶後不會補記停用期間的月份", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const rule = await insertRule({ accountId: closed.id, dayOfMonth: 6, createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 0 筆；${SKIPPED(3)}`);
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");

    await getDb().update(savingsAccounts).set({ active: true }).where(eq(savingsAccounts.id, closed.id));
    expect(await postDueRecurring(noonOf("2026-11-07"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-11-06"]);
  });

  it("轉入帳戶停用的轉帳_一樣略過但往前推", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const closed = await insertAccount({ name: "舊證券", kind: "investment", active: false });
    const rule = await insertRule({ kind: "transfer", accountId: cathay.id, counterAccountId: closed.id, dayOfMonth: 10, createdAt: noonOf("2026-10-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 0 筆；${SKIPPED(1)}`);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("固定收支改到後來才建立的帳戶_帳戶開始記帳之前的月份略過但往前推（算進略過），之後照記；再跑一次不會再算", async () => {
    // 8/1 建立的固定收支後來改到 9/20 才建立的台新 8/6 與 9/6 在台新開始記帳之前
    const taishin = await insertAccount({ name: "台新", createdAt: noonOf("2026-09-20") });
    const rule = await insertRule({ accountId: taishin.id, dayOfMonth: 6, createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 1 筆；${SKIPPED(2)}`);
    expect((await transactions()).map((t) => [t.accountId, t.date, t.recurringId])).toEqual([[taishin.id, "2026-10-06", rule.id]]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await transactions()).toHaveLength(1);
  });

  it("每月轉帳的轉入帳戶後來才建立_它開始記帳之前的月份略過但往前推，下個月照記", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment", createdAt: noonOf("2026-10-08") });
    const rule = await insertRule({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 0 筆；${SKIPPED(2)}`);
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");

    expect(await postDueRecurring(noonOf("2026-11-06"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => [t.accountId, t.counterAccountId, t.date])).toEqual([[cathay.id, broker.id, "2026-11-06"]]);
  });

  it("帳戶建立的那天（台北時間）剛好是記帳日_照記；晚一天建立的才略過", async () => {
    // UTC 10/5 16:30 是台北 10/6 00:30
    // UTC 10/6 16:30 是台北 10/7
    const sameDay = await insertAccount({ name: "當天", createdAt: new Date("2026-10-05T16:30:00Z") });
    const nextDay = await insertAccount({ name: "隔天", createdAt: new Date("2026-10-06T16:30:00Z") });
    await insertRule({ accountId: sameDay.id, dayOfMonth: 6, createdAt: noonOf("2026-10-01") });
    await insertRule({ accountId: nextDay.id, dayOfMonth: 6, createdAt: noonOf("2026-10-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 1 筆；${SKIPPED(1)}`);
    expect((await transactions()).map((t) => [t.accountId, t.date])).toEqual([[sameDay.id, "2026-10-06"]]);
  });

  it("停用的固定收支_不記但往前推_恢復後從下一次開始（不會補記暫停期間）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6, active: false, createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 0 筆；${SKIPPED(3)}`);
    await getDb().update(savingsRecurring).set({ active: true }).where(eq(savingsRecurring.id, rule.id));
    expect(await postDueRecurring(noonOf("2026-11-06"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-11-06"]);
  });

  it("停用的使用者整個凍結：不記也不往前推，恢復後補記", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01") });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect((await ruleOf(theirs.id)).lastPostedMonth).toBeNull();

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    expect(await postDueRecurring(NOW)).toBe("自動記帳 2 筆");
    expect((await transactions()).map((t) => [t.userId, t.date])).toEqual([
      [other, "2026-09-06"],
      [other, "2026-10-06"],
    ]);
  });

  it("每個人的固定收支記在他自己名下", async () => {
    const mine = await insertAccount({ name: "我的" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    await insertRule({ accountId: mine.id, dayOfMonth: 1, createdAt: noonOf("2026-10-01") });
    await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 2, createdAt: noonOf("2026-10-01") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 2 筆");
    expect((await transactions()).map((t) => [t.userId, t.accountId])).toEqual([
      [me, mine.id],
      [other, theirAccount.id],
    ]);
  });

  it("一條失敗不影響其他條_摘要寫出幾條失敗、log 只記錯誤種類與固定收支的 id", async () => {
    const log = captureErrorLog();
    const cathay = await insertAccount({ name: "國泰" });
    const broken = await insertRule({ accountId: cathay.id, dayOfMonth: 1, note: "秘密的備註", createdAt: noonOf("2026-10-01") });
    await insertRule({ accountId: cathay.id, dayOfMonth: 2, createdAt: noonOf("2026-10-01") });
    vi.spyOn(testDb, "transaction").mockImplementationOnce(() => {
      throw new Error("connection reset: secret-detail");
    });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆；1 個固定收支失敗（詳見伺服器 log）");

    expect((await transactions()).map((t) => t.date)).toEqual(["2026-10-02"]);
    expect((await ruleOf(broken.id)).lastPostedMonth).toBeNull();
    expect(loggedText(log)).toContain("固定收支自動記帳失敗");
    expect(loggedText(log)).toContain(String(broken.id));
    expect(loggedText(log)).not.toMatch(/secret-detail|秘密的備註/);
  });

  it("鎖住那條固定收支再算，用條件式 update 認領月份後才寫紀錄（同一個交易）；PGlite 只有一條連線，所以直接看送出的 SQL", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    const queries = logQueries();

    await postDueRecurring(NOW);

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "savings_recurring" .*for update of "savings_recurring"$/i.test(query));
    const claim = queries.findIndex((query) => /^update "savings_recurring" set "last_posted_month" = \$1 where .*"savings_recurring"\."last_posted_month" is null or "savings_recurring"\."last_posted_month" < \$\d/i.test(query));
    const insert = queries.findIndex((query) => /^insert into "savings_transactions"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(claim).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(claim);
  });

  it("先鎖父列（使用者、帳戶、轉入帳戶、分類：for key share）再鎖那條固定收支（for update）：跟刪除使用者、帳戶、分類時的連帶刪改同一個順序，不會互相等到被資料庫中止（deadlock）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const subscription = await insertCategory({ name: "訂閱" });
    await insertRule({ accountId: cathay.id, categoryId: subscription.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    await insertRule({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, dayOfMonth: 7, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    const statements = logStatements();

    expect(await postDueRecurring(NOW)).toBe("自動記帳 2 筆");

    // 每條固定收支一個交易 各自檢查
    const transactions = statements.reduce<{ sql: string; params: unknown[] }[][]>((all, statement) => {
      if (statement.sql === "begin") all.push([]);
      else all.at(-1)?.push(statement);
      return all;
    }, []);
    expect(transactions).toHaveLength(2);
    const locks = transactions.map((steps) => {
      const at = (pattern: RegExp) => steps.findIndex((step) => pattern.test(step.sql));
      const keyShare = (table: string) => at(new RegExp(`from "${table}" where .* for key share$`, "i"));
      const ids = (table: string) => (keyShare(table) < 0 ? [] : steps[keyShare(table)].params.filter((param) => typeof param === "number"));
      return {
        user: keyShare("core_users"),
        accounts: keyShare("savings_accounts"),
        category: keyShare("savings_categories"),
        rule: at(/from "savings_recurring" .*for update of "savings_recurring"$/i),
        insert: at(/^insert into "savings_transactions"/i),
        accountIds: ids("savings_accounts"),
        categoryIds: ids("savings_categories"),
      };
    });
    for (const lock of locks) {
      expect(lock.user).toBeGreaterThanOrEqual(0);
      expect(lock.accounts).toBeGreaterThanOrEqual(0);
      expect(lock.rule).toBeGreaterThan(Math.max(lock.user, lock.accounts, lock.category));
      expect(lock.insert).toBeGreaterThan(lock.rule);
    }
    const [expense, transfer] = locks;
    expect([expense.accountIds, expense.categoryIds]).toEqual([[cathay.id], [subscription.id]]);
    expect(expense.category).toBeGreaterThanOrEqual(0);
    expect([transfer.accountIds, transfer.category]).toEqual([[cathay.id, broker.id], -1]);
  });

  it("鎖父列之後才發現固定收支被改到別的帳戶（剛鎖的不是它現在用的）_這次不記也不往前推，下一次排程照新的帳戶補記", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    // 鎖完父列帳戶之後 鎖固定收支之前 另一個請求把它改到郵局
    const pglite = pgliteOf(testDb);
    const transaction = pglite.transaction.bind(pglite);
    let moved = false;
    vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) =>
      transaction((tx) => {
        const query = tx.query.bind(tx);
        tx.query = (async (sql: string, ...rest: unknown[]) => {
          const result = await (query as (...args: unknown[]) => Promise<unknown>)(sql, ...rest);
          if (!moved && /from "savings_accounts" where .* for key share$/i.test(sql)) {
            moved = true;
            await query(`update savings_recurring set account_id = $1 where id = $2`, [post.id, rule.id]);
          }
          return result;
        }) as typeof tx.query;
        return callback(tx);
      })) as typeof transaction);

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");

    vi.mocked(pglite.transaction).mockRestore();
    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => [t.accountId, t.date])).toEqual([[post.id, "2026-10-06"]]);
  });

  it("分類被刪掉的固定收支_照樣記，記成未分類", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const subscription = await insertCategory({ name: "訂閱" });
    const rule = await insertRule({ accountId: cathay.id, categoryId: subscription.id, dayOfMonth: 6, note: "Netflix", createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    await getDb().delete(savingsCategories).where(eq(savingsCategories.id, subscription.id));

    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => [t.categoryId, t.note, t.recurringId])).toEqual([[null, "Netflix", rule.id]]);
  });

  it("這個月記過之後改了每月的日期_不會再記一次（記到的月份不變）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });
    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆");

    await updateRecurring(me, rule.id, fields({ accountId: String(cathay.id), dayOfMonth: "10" }));
    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    await updateRecurring(me, rule.id, fields({ accountId: String(cathay.id), dayOfMonth: "20" }));
    expect(await postDueRecurring(noonOf("2026-10-31"))).toBe("自動記帳 0 筆");

    expect((await transactions()).map((t) => t.date)).toEqual(["2026-10-06"]);
    expect(await postDueRecurring(noonOf("2026-11-20"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-10-06", "2026-11-20"]);
  });

  it("還沒記過的固定收支改到這個月已經過了的日期（在建立之後）_下一次排程就補記這個月，日期是改後的那天", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 20, createdAt: noonOf("2026-10-01") });
    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");

    await updateRecurring(me, rule.id, fields({ accountId: String(cathay.id), dayOfMonth: "10" }));

    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-10-10"]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("還沒記過的固定收支改到建立那天之前的日期_這個月不補記，從下個月開始", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const rule = await insertRule({ accountId: cathay.id, dayOfMonth: 20, createdAt: noonOf("2026-10-12") });

    await updateRecurring(me, rule.id, fields({ accountId: String(cathay.id), dayOfMonth: "10" }));

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await postDueRecurring(noonOf("2026-11-10"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-11-10"]);
  });

  it("送到資料庫的參數沒有 Date 物件（正式環境經 drizzle 的 postgres-js 收到 Date 會丟錯，整個排程失敗）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    await insertRule({ accountId: cathay.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01") });
    await insertRule({ accountId: closed.id, dayOfMonth: 6, createdAt: noonOf("2026-09-01") });
    const query = vi.spyOn(pgliteOf(testDb), "query");

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 2 筆；${SKIPPED(2)}`);

    expect(query).toHaveBeenCalled();
    expect(dateParams(query)).toEqual([]);
  });
});

async function insertHolding(values: Partial<typeof savingsHoldings.$inferInsert> & { accountId: number }) {
  const [row] = await getDb().insert(savingsHoldings).values({ userId: me, symbol: "006208", name: "富邦台50", shares: 0, cost: 0, ...values }).returning();
  return row;
}

describe("新增與修改：名稱、間隔、起始月份、假日規則、記帳方式", () => {
  it("新增時沒選記帳方式_預設到期請我確認；其他新欄位照表單存", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });

    const rule = await createRecurring(me, fields({ accountId: String(living.id), name: "電費", amount: "1800", dayOfMonth: "20", intervalMonths: "2", startMonth: "2026-08", holidayRule: "after", mode: "" }), NOW);

    expect(rule).toMatchObject({ name: "電費", intervalMonths: 2, startMonth: "2026-08-01", holidayRule: "after", mode: "confirm", holdingId: null, allocate: false, lastPostedMonth: null });
  });

  it("定期定額：轉入帳戶照那一檔所在的投資帳戶（不看表單送來的），扣款帳戶要是存款帳戶", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
    const other = await insertAccount({ name: "別的證券", kind: "investment" });
    const etf = await insertHolding({ accountId: broker.id });
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });

    const rule = await createRecurring(me, fields({ kind: "transfer", accountId: String(bank.id), counterAccountId: String(other.id), holdingId: String(etf.id), amount: "5000", dayOfMonth: "5", holidayRule: "after", mode: "confirm" }), NOW);

    expect(rule).toMatchObject({ kind: "transfer", accountId: bank.id, counterAccountId: broker.id, holdingId: etf.id, mode: "confirm" });
    expect(await userError(createRecurring(me, fields({ kind: "regular", accountId: String(card.id), holdingId: String(etf.id), mode: "confirm" }), NOW))).toBe("扣款帳戶要選存款帳戶");
  });

  it("定期定額選別人的持股_當作找不到，沒有寫入", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id });

    expect(await userError(createRecurring(me, fields({ kind: "regular", accountId: String(bank.id), holdingId: String(theirs.id), mode: "confirm" }), NOW))).toBe("找不到這一檔持股，可能已經刪除了");
    expect(await rules()).toEqual([]);
  });

  it("把自己的定期定額改成買別人的持股_當作找不到，資料不變（轉入帳戶也不會變成別人的證券）", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
    const etf = await insertHolding({ accountId: broker.id });
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id, symbol: "0050", name: "元大台灣50" });
    const rule = await insertRule({ kind: "transfer", accountId: bank.id, counterAccountId: broker.id, holdingId: etf.id, mode: "confirm", dayOfMonth: 5, amount: 5000 });

    expect(await userError(updateRecurring(me, rule.id, fields({ kind: "regular", accountId: String(bank.id), holdingId: String(theirs.id), amount: "5000", dayOfMonth: "5", mode: "confirm" })))).toBe(
      "找不到這一檔持股，可能已經刪除了",
    );
    expect(await ruleOf(rule.id)).toMatchObject({ holdingId: etf.id, counterAccountId: broker.id });
  });

  it("一般轉帳的固定收支_轉進或轉出有持股的投資帳戶都擋下（新增與修改）；定期定額（帶持股）照常", async () => {
    const HELD = "這個投資帳戶有持股：轉進轉出請用買進或賣出";
    const bank = await insertAccount({ name: "台銀" });
    const post = await insertAccount({ name: "郵局" });
    const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
    const etf = await insertHolding({ accountId: broker.id });
    const plain = await insertRule({ kind: "transfer", accountId: bank.id, counterAccountId: post.id, dayOfMonth: 5, amount: 5000 });

    expect(await userError(createRecurring(me, fields({ kind: "transfer", accountId: String(bank.id), counterAccountId: String(broker.id), amount: "5000" }), NOW))).toBe(HELD);
    expect(await userError(createRecurring(me, fields({ kind: "transfer", accountId: String(broker.id), counterAccountId: String(bank.id), amount: "5000" }), NOW))).toBe(HELD);
    expect(await userError(updateRecurring(me, plain.id, fields({ kind: "transfer", accountId: String(bank.id), counterAccountId: String(broker.id), amount: "5000" })))).toBe(HELD);
    expect((await rules()).map((r) => [r.id, r.counterAccountId])).toEqual([[plain.id, post.id]]);

    expect(await createRecurring(me, fields({ kind: "regular", accountId: String(bank.id), holdingId: String(etf.id), amount: "5000", mode: "confirm" }), NOW)).toMatchObject({ counterAccountId: broker.id, holdingId: etf.id });
  });

  it("薪水（分配到各帳戶）不能入帳到信用卡", async () => {
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });

    expect(await userError(createRecurring(me, fields({ kind: "income", accountId: String(card.id), allocate: "on", mode: "confirm" }), NOW))).toBe("薪水要入帳到存款或投資帳戶");
  });

  it("改間隔與日期_游標不動，處理過的期別不重來", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 20, mode: "confirm", lastPostedMonth: "2026-10-01" });

    expect(await updateRecurring(me, rule.id, fields({ accountId: String(living.id), dayOfMonth: "5", intervalMonths: "3", startMonth: "2026-07", mode: "confirm" }))).toMatchObject({
      intervalMonths: 3,
      startMonth: "2026-07-01",
      dayOfMonth: 5,
      lastPostedMonth: "2026-10-01",
    });
  });
});

describe("postDueRecurring：假日規則、每幾個月一次、要確認的不自動記", () => {
  it("遇假日提前：每月 10 日在 2026 年 10 月記在 10/8（10/9 補假、10/10 國慶日）", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    await insertRule({ kind: "income", accountId: living.id, dayOfMonth: 10, holidayRule: "before", createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });

    expect(await postDueRecurring(noonOf("2026-10-07"))).toBe("自動記帳 0 筆");
    expect(await postDueRecurring(noonOf("2026-10-08"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-10-08"]);
  });

  it("遇假日延後：每月 5 日在 2026 年 9 月記在 9/7（9/5、9/6 是週末）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertRule({ accountId: cathay.id, dayOfMonth: 5, holidayRule: "after", createdAt: noonOf("2026-08-15") });

    expect(await postDueRecurring(noonOf("2026-09-06"))).toBe("自動記帳 0 筆");
    expect(await postDueRecurring(noonOf("2026-09-07"))).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-09-07"]);
  });

  it("每 2 個月一次（從 8 月開始）_只記 8 月與 10 月，9 月不記", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 20, intervalMonths: 2, startMonth: "2026-08-01", createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(noonOf("2026-10-25"))).toBe("自動記帳 2 筆");
    expect((await transactions()).map((t) => t.date)).toEqual(["2026-08-20", "2026-10-20"]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("到期請我確認的不自動記，游標也不動（等使用者確認或略過）", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 6, mode: "confirm", createdAt: noonOf("2026-09-01") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBeNull();
  });

  it("要確認的固定收支停用了_到期的期別略過往前推，恢復後不會一次跳出一堆待處理", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 6, mode: "confirm", active: false, createdAt: noonOf("2026-08-01") });

    expect(await postDueRecurring(NOW)).toBe(`自動記帳 0 筆；${SKIPPED(3)}`);
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("自動記的一般轉帳碰到有持股的投資帳戶_那一期略過、游標往前推（不會每天失敗），log 只記固定收支的 id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    await insertHolding({ accountId: broker.id });
    const rule = await insertRule({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, amount: 5000, dayOfMonth: 6, note: "秘密的備註", createdAt: noonOf("2026-09-01"), lastPostedMonth: "2026-09-01" });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆；略過 1 筆轉帳（投資帳戶有持股，請改用買進或賣出）");
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
    expect(loggedText(warn)).toContain(String(rule.id));
    expect(loggedText(warn)).not.toMatch(/秘密的備註|5000|5,000|國泰/);
    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆");
  });

  it("自動記的紀錄備註用規則的備註，沒有備註用名稱；不帶期別（只有確認來的才有）", async () => {
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });
    await insertRule({ accountId: card.id, dayOfMonth: 12, name: "Netflix", createdAt: noonOf("2026-10-01") });

    expect(await postDueRecurring(NOW)).toBe("自動記帳 1 筆");
    expect((await transactions()).map((t) => [t.note, t.recurringPeriod])).toEqual([["Netflix", null]]);
  });
});
