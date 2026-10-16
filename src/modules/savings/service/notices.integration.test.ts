import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications, coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { captureErrorLog, mocksOf } from "@/dev/test-helpers";
import { savingsAccounts, savingsCardBills, savingsRecurring, savingsTransactions } from "../data/schema";

// 排程 savings:recurring 寄的到期通知 沒設定回應時 notify 照常寫進資料庫
vi.mock("@/core/notify", { spy: true });
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { postDueRecurring } = await import("./recurring");

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  notify.mockReset();
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

/** 台北時間那天的 00:30 排程在這個時候跑 */
const runAt = (date: string) => new Date(new Date(`${date}T00:30:00+08:00`).getTime());
const CREATED = new Date("2026-08-01T04:00:00Z");

async function insertAccount(values: Partial<typeof savingsAccounts.$inferInsert> & { name: string }) {
  const [row] = await getDb().insert(savingsAccounts).values({ userId: me, kind: "deposit", createdAt: CREATED, ...values }).returning();
  return row;
}

async function insertRule(values: Partial<typeof savingsRecurring.$inferInsert> & { accountId: number; dayOfMonth: number }) {
  const [row] = await getDb()
    .insert(savingsRecurring)
    .values({ userId: me, kind: "expense", amount: 1800, mode: "confirm", createdAt: CREATED, lastPostedMonth: "2026-09-01", ...values })
    .returning();
  return row;
}

const notices = () =>
  getDb()
    .select({ userId: coreNotifications.userId, module: coreNotifications.module, kind: coreNotifications.kind, title: coreNotifications.title, url: coreNotifications.url })
    .from(coreNotifications)
    .orderBy(asc(coreNotifications.id));

describe("要確認的固定收支：某一期的日期是今天就通知擁有者", () => {
  it("電費 10/20 到期_當天寄「今天到期：電費 $1,800」連到 /savings；再跑一次不重複寄", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    await insertRule({ accountId: living.id, dayOfMonth: 20, name: "電費" });

    expect(await postDueRecurring(runAt("2026-10-19"))).toBe("自動記帳 0 筆");
    expect(await postDueRecurring(runAt("2026-10-20"))).toBe("自動記帳 0 筆；通知 1 則");
    expect(await postDueRecurring(runAt("2026-10-20"))).toBe("自動記帳 0 筆");

    expect(await notices()).toEqual([{ userId: me, module: "savings", kind: "recurring_due", title: "今天到期：電費 $1,800", url: "/savings" }]);
  });

  it("薪水（分配到各帳戶）_寫「今天發薪：記得確認實際金額」；10 日遇國慶連假提前到 10/8 才是那一天", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    await insertRule({ kind: "income", accountId: living.id, dayOfMonth: 10, holidayRule: "before", allocate: true, name: "薪水", amount: 52_000 });

    await postDueRecurring(runAt("2026-10-08"));
    await postDueRecurring(runAt("2026-10-10"));

    expect((await notices()).map((n) => n.title)).toEqual(["今天發薪：記得確認實際金額"]);
  });

  it("沒取名的舊規則用紀錄的寫法當名稱（轉帳寫兩個帳戶）", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const living = await insertAccount({ name: "生活費帳戶" });
    await insertRule({ kind: "transfer", accountId: living.id, counterAccountId: bank.id, dayOfMonth: 20, amount: 5000 });

    await postDueRecurring(runAt("2026-10-20"));

    expect((await notices()).map((n) => n.title)).toEqual(["今天到期：生活費帳戶 → 台銀 $5,000"]);
  });

  it("自動記的、停用的、帳戶停用的、這一期已經確認的、日期不是今天的_都不寄", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    await insertRule({ accountId: living.id, dayOfMonth: 20, mode: "auto" });
    await insertRule({ accountId: living.id, dayOfMonth: 20, active: false });
    await insertRule({ accountId: closed.id, dayOfMonth: 20 });
    await insertRule({ accountId: living.id, dayOfMonth: 20, lastPostedMonth: "2026-10-01" });
    await insertRule({ accountId: living.id, dayOfMonth: 21 });

    await postDueRecurring(runAt("2026-10-20"));

    expect(await notices()).toEqual([]);
  });

  it("停用的使用者凍結：不寄，也不認領；恢復後到期那天照常寄", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 20, name: "房租" });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    await postDueRecurring(runAt("2026-10-20"));

    expect(await notices()).toEqual([]);
    expect((await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, theirs.id)))[0].lastNotifiedOn).toBeNull();

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    await postDueRecurring(runAt("2026-10-20"));

    expect(await notices()).toEqual([{ userId: other, module: "savings", kind: "recurring_due", title: "今天到期：房租 $1,800", url: "/savings" }]);
  });

  it("寄送失敗_退回認領，重送時還能寄；摘要寫出幾則失敗，log 只記種類與 id", async () => {
    const log = captureErrorLog();
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 20, name: "電費" });
    notify.mockRejectedValueOnce(new Error("connection reset: secret-detail"));

    expect(await postDueRecurring(runAt("2026-10-20"))).toBe("自動記帳 0 筆；1 則通知失敗（詳見伺服器 log）");
    expect((await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, rule.id)))[0].lastNotifiedOn).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain(String(rule.id));

    expect(await postDueRecurring(runAt("2026-10-20"))).toBe("自動記帳 0 筆；通知 1 則");
  });
});

describe("信用卡：結帳隔天還沒填帳單、照帳單的截止日前 3 天還沒繳清就通知", () => {
  // 國泰卡每月 5 日結帳 結帳時欠 6,340 之後 10/7 又刷 5,910 都還沒繳
  async function cathay(values: Partial<typeof savingsAccounts.$inferInsert> = {}) {
    const living = await insertAccount({ name: "生活費帳戶" });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -6340, statementDay: 5, payFromAccountId: living.id, ...values });
    await getDb().insert(savingsTransactions).values({ userId: card.userId, kind: "expense", accountId: card.id, amount: 5910, date: "2026-10-07" });
    return { living, card };
  }
  const enterBill = async (card: { id: number; userId: string }, statementDate: string, dueDate: string, amount: number) =>
    getDb().insert(savingsCardBills).values({ userId: card.userId, accountId: card.id, statementDate, dueDate, amount });

  it("10/5 結帳、還沒填帳單_10/6 寄「國泰卡 已結帳：照帳單填金額與截止日」；結帳當天與再隔一天不寄、同一天不重複", async () => {
    await cathay();

    for (const date of ["2026-10-05", "2026-10-06", "2026-10-06", "2026-10-07"]) await postDueRecurring(runAt(date));

    expect(await notices()).toEqual([{ userId: me, module: "savings", kind: "card_statement", title: "國泰卡 已結帳：照帳單填金額與截止日", url: "/savings" }]);
  });

  it("結帳隔天之前就填了帳單_不寄填帳單的提醒", async () => {
    const { card } = await cathay();
    await enterBill(card, "2026-10-05", "2026-10-20", 6340);

    await postDueRecurring(runAt("2026-10-06"));

    expect(await notices()).toEqual([]);
  });

  it("還沒填帳單就不知道截止日：舊版設的截止日（20 日）不再拿來提醒，10/17 不寄", async () => {
    await cathay({ dueDay: 20 });
    await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -3500, dueDay: 20, autopay: true });

    for (const date of ["2026-10-16", "2026-10-17", "2026-10-18"]) await postDueRecurring(runAt(date));

    expect(await notices()).toEqual([]);
  });

  it("填了帳單還沒繳清_照帳單的截止日前 3 天（10/17）寄「國泰卡 10/20 截止：本期應繳 $6,340」（結帳後刷的下期才繳）；前後一天不寄", async () => {
    const { card } = await cathay();
    await enterBill(card, "2026-10-05", "2026-10-20", 6340);

    for (const date of ["2026-10-16", "2026-10-17", "2026-10-18"]) await postDueRecurring(runAt(date));

    expect(await notices()).toEqual([{ userId: me, module: "savings", kind: "card_due", title: "國泰卡 10/20 截止：本期應繳 $6,340", url: "/savings" }]);
  });

  it("帳單的截止日填 10/25（週日、10/26 補假）_照順延後的 10/27 在 10/24 提醒，原本的 10/22 不寄", async () => {
    const { card } = await cathay();
    await enterBill(card, "2026-10-05", "2026-10-25", 6340);

    await postDueRecurring(runAt("2026-10-22"));
    expect(await notices()).toEqual([]);
    await postDueRecurring(runAt("2026-10-24"));

    expect((await notices()).map((n) => n.title)).toEqual(["國泰卡 10/27 截止：本期應繳 $6,340"]);
  });

  it("自動扣繳的卡填了帳單_寫「<M/D> 自動扣繳：本期 $金額，記得確認」；沒有結帳日的卡自己填了帳單也照樣提醒", async () => {
    const card = await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -3500, autopay: true });
    await enterBill(card, "2026-10-15", "2026-10-23", 3500);

    await postDueRecurring(runAt("2026-10-20"));

    expect((await notices()).map((n) => n.title)).toEqual(["台新卡 10/23 自動扣繳：本期 $3,500，記得確認"]);
  });

  it("填了帳單也繳清了、停用的卡、別人停用的帳號_結帳隔天與截止前都不寄", async () => {
    const { living, card } = await cathay();
    await enterBill(card, "2026-10-05", "2026-10-20", 6340);
    await getDb().insert(savingsTransactions).values({ userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 6340, date: "2026-10-12" });
    await insertAccount({ name: "停用的卡", kind: "credit", openingBalance: -900, statementDay: 5, active: false });
    await insertAccount({ name: "別人的卡", kind: "credit", openingBalance: -900, statementDay: 5, userId: other });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    await postDueRecurring(runAt("2026-10-06"));
    await postDueRecurring(runAt("2026-10-17"));

    expect(await notices()).toEqual([]);
  });

  it("停用的使用者的卡不寄也不認領；恢復後結帳隔天照常寄", async () => {
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", openingBalance: -900, statementDay: 5, userId: other });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    await postDueRecurring(runAt("2026-10-06"));
    expect(await notices()).toEqual([]);
    expect((await getDb().select().from(savingsAccounts).where(eq(savingsAccounts.id, theirCard.id)))[0].cardNotifiedOn).toBeNull();

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    await postDueRecurring(runAt("2026-10-06"));

    expect(await notices()).toEqual([{ userId: other, module: "savings", kind: "card_statement", title: "別人的卡 已結帳：照帳單填金額與截止日", url: "/savings" }]);
  });

  it("送到資料庫的參數沒有 Date 物件（正式環境經 postgres-js 收到 Date 會丟錯）", async () => {
    // 10/20 這一天三種都寄 19 日結帳的卡還沒填帳單 10/23 截止的帳單 20 日到期的固定收支
    await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -6340, statementDay: 19 });
    const taishin = await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -3500 });
    await enterBill(taishin, "2026-10-15", "2026-10-23", 3500);
    const living = await insertAccount({ name: "生活費帳戶" });
    await insertRule({ accountId: living.id, dayOfMonth: 20, name: "電費" });
    const query = vi.spyOn((testDb as TestDb & { $client: PGlite }).$client, "query");

    expect(await postDueRecurring(runAt("2026-10-20"))).toBe("自動記帳 0 筆；通知 3 則");

    const params = query.mock.calls.flatMap(([, values]) => (Array.isArray(values) ? values : []));
    expect(params.filter((param) => param instanceof Date)).toEqual([]);
  });
});
