import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { savingsAccounts, savingsCardBills, savingsCategories, savingsTransactions } from "../data/schema";
import { dateParams, pgliteOf, savingsRows } from "../dev/db-fixtures";
import { userError } from "../dev/fixtures";
import { cardBill } from "../lib/cards";
import { accountBalances } from "../lib/ledger";
import { listAccounts } from "./accounts";
import { cardDailyFlows, enterCardBill, listCardBills, payCard, type CardBillFields, type PayCardFields } from "./cards";
import { postDueRecurring } from "./recurring";
import { accountMonthFlows, deleteTransaction, updateTransaction } from "./transactions";

const getDb = setupTestDb();
let me: string;
let other: string;

// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-08-01T04:00:00Z");
const ACCOUNT_NOT_FOUND = "找不到這個帳戶，可能已經刪除了";

const { insertAccount, transactions } = savingsRows(getDb, () => me, { account: { createdAt: CREATED } });

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});
const pay = (cardId: number, fromAccountId: number, values: Partial<PayCardFields> = {}): PayCardFields => ({ cardId: String(cardId), fromAccountId: String(fromAccountId), amount: "6,340", date: "2026-10-15", ...values });
const billFields = (cardId: number, values: Partial<CardBillFields> = {}): CardBillFields => ({ cardId: String(cardId), amount: "12,480", statementDate: "", dueDate: "2026-10-20", categoryId: "", ...values });
const bills = () => getDb().select().from(savingsCardBills).orderBy(asc(savingsCardBills.id));
const reconciles = async () => (await transactions()).filter((row) => row.cardBillId !== null);

/** 用 service 讀到的資料算這張卡現在的帳單 跟總覽的算法一樣 */
async function billNow(card: typeof savingsAccounts.$inferSelect, today = "2026-10-15") {
  const balances = accountBalances(await listAccounts(card.userId), await accountMonthFlows(card.userId));
  return cardBill(card, balances.get(card.id)?.balance ?? 0, await cardDailyFlows(card.userId, "2026-08-06"), today, await listCardBills(card.userId));
}

async function setup() {
  const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
  const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -6340, statementDay: 5, payFromAccountId: living.id });
  await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: card.id, amount: 5910, date: "2026-10-07" });
  return { living, card };
}

describe("payCard（繳卡費）", () => {
  it("記一筆存款轉到信用卡的轉帳，備註是繳卡費", async () => {
    const { living, card } = await setup();

    const { transaction } = await payCard(me, pay(card.id, living.id), NOW);

    expect(transaction).toMatchObject({ userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 6340, date: "2026-10-15", note: "繳卡費" });
  });

  it("照紀錄繳清了這一期但還沒填帳單_照估計還要繳 0（結帳後刷的 5,910 是下一期的），還是要填帳單（還沒有截止日）", async () => {
    const { living, card } = await setup();
    await payCard(me, pay(card.id, living.id), NOW);

    expect(await billNow(card)).toMatchObject({ estimate: 6340, paid: 6340, remainingDue: 0, owedNow: 5910, needsBill: true, status: "needs-bill", dueDate: null });
  });

  it("要繳的是信用卡、扣款的是存款帳戶、兩個都要啟用中、日期不能在未來；都不寫入", async () => {
    const { living, card } = await setup();
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const closedCard = await insertAccount({ name: "停用的卡", kind: "credit", active: false });

    expect(await userError(payCard(me, pay(living.id, broker.id), NOW))).toBe("繳卡費要選信用卡");
    expect(await userError(payCard(me, pay(card.id, broker.id), NOW))).toBe("扣款帳戶要選存款帳戶");
    expect(await userError(payCard(me, pay(closedCard.id, living.id), NOW))).toBe("這個帳戶已停用，請先恢復");
    expect(await userError(payCard(me, pay(card.id, living.id, { date: "2026-10-16" }), NOW))).toBe("不能記錄未來的日期");
    expect((await transactions()).filter((t) => t.kind === "transfer")).toEqual([]);
  });

  it("繳別人的卡、或從別人的帳戶扣款_當作找不到，什麼都不寫", async () => {
    const { living, card } = await setup();
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", userId: other });
    const theirBank = await insertAccount({ name: "別人的存款", userId: other });

    expect(await userError(payCard(me, pay(theirCard.id, living.id), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(payCard(me, pay(card.id, theirBank.id), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect((await transactions()).filter((t) => t.kind === "transfer")).toEqual([]);
  });
});

describe("cardDailyFlows（信用卡每天的流量）", () => {
  it("只有自己的信用卡；別人的卡與存款帳戶不算", async () => {
    const { card } = await setup();
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", userId: other });
    await getDb().insert(savingsTransactions).values({ userId: other, kind: "expense", accountId: theirCard.id, amount: 999, date: "2026-10-07" });

    expect(await cardDailyFlows(me, "2026-10-01")).toEqual([{ accountId: card.id, date: "2026-10-07", income: 0, expense: 5910, transferIn: 0, transferOut: 0, adjust: 0 }]);
  });
});

describe("enterCardBill（填帳單：金額與截止日照銀行的，跟紀錄算的結帳日未繳差多少自動補一筆）", () => {
  /** 國泰卡 每月 5 日結帳 紀錄上的未繳是 openingBalance */
  async function cathay(openingBalance = -3000, values: Partial<typeof savingsAccounts.$inferInsert> = {}) {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance, statementDay: 5, payFromAccountId: living.id, ...values });
    return { living, card };
  }

  it("紀錄的結帳日未繳 3,000、帳單 12,480_結帳日那天補一筆 9,480 的刷卡（未分類）；同一期再填 12,000_換成補 9,000，不會補兩次", async () => {
    const { card } = await cathay();

    const first = await enterCardBill(me, billFields(card.id), NOW);

    expect(first).toMatchObject({ difference: 9480, bill: { accountId: card.id, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12_480 } });
    expect((await reconciles()).map((t) => [t.kind, t.accountId, t.amount, t.date, t.categoryId, t.note, t.cardBillId])).toEqual([
      ["expense", card.id, 9480, "2026-10-05", null, "未記錄的刷卡（帳單差額）", first.bill.id],
    ]);

    const second = await enterCardBill(me, billFields(card.id, { amount: "12,000" }), NOW);

    expect(second.bill.id).toBe(first.bill.id);
    expect((await bills()).map((b) => [b.statementDate, b.amount])).toEqual([["2026-10-05", 12_000]]);
    expect((await reconciles()).map((t) => [t.kind, t.amount])).toEqual([["expense", 9000]]);
  });

  it("帳單比紀錄少（紀錄 5,000、帳單 4,000）_補一筆加 1,000 的調整；再填一樣多的 5,000_不補，上次的調整也拿掉", async () => {
    const { card } = await cathay(-5000);

    expect((await enterCardBill(me, billFields(card.id, { amount: "4,000" }), NOW)).difference).toBe(-1000);
    expect((await reconciles()).map((t) => [t.kind, t.amount, t.date, t.note])).toEqual([["adjust", 1000, "2026-10-05", "帳單差額"]]);

    expect((await enterCardBill(me, billFields(card.id, { amount: "5,000" }), NOW)).difference).toBe(0);
    expect(await reconciles()).toEqual([]);
  });

  it("只看結帳日當天以前的紀錄：結帳日刷的 1,000 算這一期，之後刷的與繳的不算（紀錄 4,000、帳單 6,000，補 2,000）", async () => {
    const { living, card } = await cathay(-3000);
    await getDb()
      .insert(savingsTransactions)
      .values([
        { userId: me, kind: "expense", accountId: card.id, amount: 1000, date: "2026-10-05" },
        { userId: me, kind: "expense", accountId: card.id, amount: 700, date: "2026-10-07" },
        { userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 2000, date: "2026-10-10" },
      ]);

    expect((await enterCardBill(me, billFields(card.id, { amount: "6,000" }), NOW)).difference).toBe(2000);
  });

  it("截止日照填的存（10/25 是週日也照存）；待處理照順延後的 10/27 算幾天與逾期", async () => {
    const { card } = await cathay();

    expect((await enterCardBill(me, billFields(card.id, { dueDate: "2026-10-25" }), NOW)).bill).toMatchObject({ statementDate: "2026-10-05", dueDate: "2026-10-25" });
    expect(await billNow(card, "2026-10-26")).toMatchObject({ dueDate: "2026-10-27", status: "upcoming", daysLeft: 1 });
    expect(await billNow(card, "2026-10-28")).toMatchObject({ dueDate: "2026-10-27", status: "overdue", daysLeft: -1 });
  });

  it("截止日要在結帳日到結帳後 60 天之間（10/5 結帳：10/4、12/5 擋下，什麼都不寫；10/5 與 12/4 可以）；同一期再填會換成新的截止日", async () => {
    const { card } = await cathay();

    expect(await userError(enterCardBill(me, billFields(card.id, { dueDate: "2026-10-04" }), NOW))).toContain("繳款截止日");
    expect(await userError(enterCardBill(me, billFields(card.id, { dueDate: "2026-12-05" }), NOW))).toContain("繳款截止日");
    expect(await bills()).toEqual([]);
    expect(await reconciles()).toEqual([]);

    await enterCardBill(me, billFields(card.id, { dueDate: "2026-10-05" }), NOW);
    await enterCardBill(me, billFields(card.id, { dueDate: "2026-12-04" }), NOW);
    expect((await bills()).map((b) => [b.statementDate, b.dueDate])).toEqual([["2026-10-05", "2026-12-04"]]);
  });

  it("沒填截止日_擋下，什麼都不寫", async () => {
    const { card } = await cathay();

    expect(await userError(enterCardBill(me, billFields(card.id, { dueDate: "" }), NOW))).toContain("繳款截止日");
    expect(await bills()).toEqual([]);
  });

  it("填了帳單之後_本期還要繳的照帳單算（12,480 減結帳後繳的 2,000 是 10,480），不用再填", async () => {
    const { living, card } = await cathay(-3000);
    await getDb().insert(savingsTransactions).values({ userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 2000, date: "2026-10-10" });

    await enterCardBill(me, billFields(card.id), NOW);

    expect(await billNow(card)).toMatchObject({ statementAmount: 12_480, paid: 2000, remainingDue: 10_480, needsBill: false, status: "upcoming" });
  });

  it("補的刷卡可以選自己的支出分類；別人的分類、收入的分類_擋下，什麼都不寫", async () => {
    const { card } = await cathay();
    const [food] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "餐飲", color: "orange" }).returning();
    const [salary] = await getDb().insert(savingsCategories).values({ userId: me, kind: "income", name: "薪水", color: "green" }).returning();
    const [theirs] = await getDb().insert(savingsCategories).values({ userId: other, kind: "expense", name: "別人的", color: "blue" }).returning();

    expect(await userError(enterCardBill(me, billFields(card.id, { categoryId: String(theirs.id) }), NOW))).toBe("找不到這個分類，可能已經刪除了");
    expect(await userError(enterCardBill(me, billFields(card.id, { categoryId: String(salary.id) }), NOW))).toBe("分類跟收支類型不符");
    expect(await bills()).toEqual([]);
    expect(await reconciles()).toEqual([]);

    await enterCardBill(me, billFields(card.id, { categoryId: String(food.id) }), NOW);
    expect((await reconciles()).map((t) => t.categoryId)).toEqual([food.id]);
  });

  it("填別人的卡_當作找不到；填在存款帳戶、停用的卡_擋下；都不寫", async () => {
    const { living } = await cathay();
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", statementDay: 5, userId: other });
    const closed = await insertAccount({ name: "停用的卡", kind: "credit", statementDay: 5, active: false });

    expect(await userError(enterCardBill(me, billFields(theirCard.id), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(enterCardBill(me, billFields(living.id), NOW))).toContain("信用卡");
    expect(await userError(enterCardBill(me, billFields(closed.id), NOW))).toBe("這個帳戶已停用，請先恢復");
    expect(await bills()).toEqual([]);
    expect(await getDb().select().from(savingsTransactions).where(eq(savingsTransactions.userId, other))).toEqual([]);
  });

  it("指定結帳日：上一期 9/5（截止日照填的 9/20）可以；不是結帳日、未來、開始記帳之前的期別_擋下", async () => {
    const { card } = await cathay();

    expect((await enterCardBill(me, billFields(card.id, { statementDate: "2026-09-05", dueDate: "2026-09-20", amount: "3,000" }), NOW)).bill).toMatchObject({ statementDate: "2026-09-05", dueDate: "2026-09-20" });
    expect(await userError(enterCardBill(me, billFields(card.id, { statementDate: "2026-10-06" }), NOW))).toContain("結帳日");
    expect(await userError(enterCardBill(me, billFields(card.id, { statementDate: "2026-10-16" }), NOW))).toContain("未來");
    expect(await userError(enterCardBill(me, billFields(card.id, { statementDate: "2026-06-05", dueDate: "2026-06-20" }), NOW))).toContain("開始記帳");
  });

  it("開始記帳時還沒繳的那一期（7/5 結帳，8/1 才開始記帳）也能填_補的那一筆記在開始記帳那天", async () => {
    const { card } = await cathay(-3000);

    expect((await enterCardBill(me, billFields(card.id, { statementDate: "2026-07-05", dueDate: "2026-07-20", amount: "3,500" }), NOW)).difference).toBe(500);
    expect((await reconciles()).map((t) => [t.amount, t.date])).toEqual([[500, "2026-08-01"]]);
  });

  it("沒有結帳日（也沒有舊的截止日設定）的卡也能填：填的那天就是結帳日，截止日照填的存；那天以前的紀錄才算這一期，之後還沒繳清就列進待處理", async () => {
    const card = await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -2000 });
    await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: card.id, amount: 500, date: "2026-10-18" });

    expect(await billNow(card, "2026-10-18")).toMatchObject({ needsBill: false, status: "none" });

    const { bill, difference } = await enterCardBill(me, billFields(card.id, { amount: "3,000", dueDate: "2026-10-25" }), new Date("2026-10-18T04:00:00Z"));

    expect(bill).toMatchObject({ statementDate: "2026-10-18", dueDate: "2026-10-25", amount: 3000 });
    expect(difference).toBe(1000);
    expect((await reconciles()).map((t) => [t.kind, t.amount, t.date])).toEqual([["expense", 1000, "2026-10-18"]]);
    expect(await billNow(card, "2026-10-20")).toMatchObject({ statementDate: bill.statementDate, statementAmount: 3000, remainingDue: 3000, dueDate: "2026-10-27", status: "upcoming", daysLeft: 7 });
  });

  it("沒有結帳日的卡：截止日不能早於填帳單那天（就是結帳日）", async () => {
    const card = await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -2000 });

    expect(await userError(enterCardBill(me, billFields(card.id, { dueDate: "2026-10-17" }), new Date("2026-10-18T04:00:00Z")))).toContain("繳款截止日");
    expect(await bills()).toEqual([]);
  });

  it("送到資料庫的參數沒有 Date 物件（正式環境經 postgres-js 收到 Date 會丟錯）", async () => {
    const { living, card } = await cathay();
    const query = vi.spyOn(pgliteOf(getDb()), "query");

    await enterCardBill(me, billFields(card.id), NOW);
    await payCard(me, pay(card.id, living.id, { billAmount: "12,000", dueDate: "2026-10-20" }), NOW);
    await listCardBills(me);

    expect(dateParams(query)).toEqual([]);
  });
});

describe("payCard 帶帳單金額（填這一期的帳單再記繳款，同一個交易）", () => {
  it("帳單 12,480、紀錄 3,000_補 9,480 再記繳款 12,480，截止日照填的存，這一期繳清不列", async () => {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -3000, statementDay: 5, payFromAccountId: living.id });

    const result = await payCard(me, pay(card.id, living.id, { amount: "12,480", billAmount: "12,480", dueDate: "2026-10-25" }), NOW);

    expect(result).toMatchObject({
      difference: 9480,
      bill: { statementDate: "2026-10-05", dueDate: "2026-10-25", amount: 12_480 },
      transaction: { kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 12_480, note: "繳卡費" },
    });
    expect(await billNow(card)).toMatchObject({ statementAmount: 12_480, paid: 12_480, remainingDue: 0, needsBill: false, status: "none" });
  });

  it("一起填帳單時補的刷卡可以選自己的支出分類；別人的分類_擋下，連繳款也不寫", async () => {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -3000, statementDay: 5, payFromAccountId: living.id });
    const [food] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "餐飲", color: "orange" }).returning();
    const [theirs] = await getDb().insert(savingsCategories).values({ userId: other, kind: "expense", name: "別人的", color: "blue" }).returning();

    expect(await userError(payCard(me, pay(card.id, living.id, { billAmount: "12,480", dueDate: "2026-10-20", categoryId: String(theirs.id) }), NOW))).toBe("找不到這個分類，可能已經刪除了");
    expect(await transactions()).toEqual([]);
    expect(await bills()).toEqual([]);

    await payCard(me, pay(card.id, living.id, { amount: "12,480", billAmount: "12,480", dueDate: "2026-10-20", categoryId: String(food.id) }), NOW);
    expect((await reconciles()).map((t) => [t.kind, t.amount, t.categoryId])).toEqual([["expense", 9480, food.id]]);
  });

  it("沒有結帳日的卡：填帳單那天繳的就算這一期已繳，補的差額照繳款之前的紀錄算", async () => {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "台新卡", kind: "credit", openingBalance: -3500 });
    const now = new Date("2026-10-18T04:00:00Z");

    const result = await payCard(me, pay(card.id, living.id, { amount: "3,500", date: "2026-10-18", billAmount: "3,500", dueDate: "2026-10-26" }), now);

    expect(result.difference).toBe(0);
    expect(await billNow(card, "2026-10-18")).toMatchObject({ statementDate: "2026-10-18", paid: 3500, remainingDue: 0, status: "none" });
  });

  it("帳單金額不對、沒填截止日、截止日早於結帳日_連繳款也不寫", async () => {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -3000, statementDay: 5 });

    expect(await userError(payCard(me, pay(card.id, living.id, { billAmount: "-1", dueDate: "2026-10-20" }), NOW))).toContain("帳單金額");
    expect(await userError(payCard(me, pay(card.id, living.id, { billAmount: "3,000" }), NOW))).toContain("繳款截止日");
    expect(await userError(payCard(me, pay(card.id, living.id, { billAmount: "3,000", dueDate: "2026-10-04" }), NOW))).toContain("繳款截止日");
    expect(await transactions()).toEqual([]);
    expect(await bills()).toEqual([]);
  });
});

describe("帳單紀錄、撤銷與修改", () => {
  async function cardWithBills() {
    const living = await insertAccount({ name: "生活費帳戶", openingBalance: 80_000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit", openingBalance: -3000, statementDay: 5, payFromAccountId: living.id });
    return { living, card };
  }

  it("listCardBills_每張卡最新 5 張、結帳日新到舊，帶這張繳了多少與最後一次繳款；別人的帳單不在裡面", async () => {
    const { living, card } = await cardWithBills();
    const months = ["2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05"];
    await getDb()
      .insert(savingsCardBills)
      .values(months.map((statementDate) => ({ userId: me, accountId: card.id, statementDate, dueDate: statementDate.replace(/-05$/, "-20"), amount: 1000 })));
    await getDb()
      .insert(savingsTransactions)
      .values([
        { userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 600, date: "2026-08-15" },
        { userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 400, date: "2026-09-05" },
        { userId: me, kind: "transfer", accountId: living.id, counterAccountId: card.id, amount: 1000, date: "2026-09-18" },
      ]);
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", statementDay: 5, userId: other });
    await getDb().insert(savingsCardBills).values({ userId: other, accountId: theirCard.id, statementDate: "2026-09-05", dueDate: "2026-09-21", amount: 999 });

    expect((await listCardBills(me)).map((b) => [b.statementDate, b.paid, b.lastPaidOn])).toEqual([
      ["2026-09-05", 1000, "2026-09-18"],
      ["2026-08-05", 1000, "2026-09-05"],
      ["2026-07-05", 0, null],
      ["2026-06-05", 0, null],
      ["2026-05-05", 0, null],
    ]);
  });

  it("從紀錄頁刪掉補的那一筆_帳單一起刪，這一期又要填帳單（估計回到紀錄算的 3,000）", async () => {
    const { card } = await cardWithBills();
    await enterCardBill(me, billFields(card.id), NOW);
    const [reconcile] = await reconciles();

    expect(await deleteTransaction(me, reconcile.id)).toBe(true);

    expect(await bills()).toEqual([]);
    expect(await billNow(card)).toMatchObject({ needsBill: true, statementAmount: null, estimate: 3000 });
  });

  it("刪掉別人補的那一筆_回 false，他的帳單還在", async () => {
    const theirCard = await insertAccount({ name: "別人的卡", kind: "credit", openingBalance: -3000, statementDay: 5, userId: other });
    await enterCardBill(other, billFields(theirCard.id), NOW);
    const [reconcile] = await reconciles();

    expect(await deleteTransaction(me, reconcile.id)).toBe(false);
    expect(await bills()).toHaveLength(1);
  });

  it("補的刷卡只能改分類和備註（照原本送回金額與日期）；改金額或日期_擋下；補的調整不能改", async () => {
    const { card } = await cardWithBills();
    const [food] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "餐飲", color: "orange" }).returning();
    await enterCardBill(me, billFields(card.id), NOW);
    const [expense] = await reconciles();
    const same = { kind: "expense", accountId: String(card.id), counterAccountId: "", categoryId: String(food.id), amount: "9,480", date: "2026-10-05", note: "聚餐" };

    expect(await updateTransaction(me, expense.id, same, NOW)).toMatchObject({ categoryId: food.id, note: "聚餐", amount: 9480, cardBillId: expense.cardBillId });
    expect(await userError(updateTransaction(me, expense.id, { ...same, amount: "9,000" }, NOW))).toContain("重新填帳單");
    expect(await userError(updateTransaction(me, expense.id, { ...same, date: "2026-10-06" }, NOW))).toContain("重新填帳單");

    await enterCardBill(me, billFields(card.id, { amount: "2,000" }), NOW);
    const [adjust] = await reconciles();
    expect(adjust.kind).toBe("adjust");
    expect(await userError(updateTransaction(me, adjust.id, { ...same, kind: "expense", amount: "1,000" }, NOW))).toContain("重新填帳單");
  });

  it("排程每張卡只留最新 5 張（7 張的清掉 2 張、6 張的清掉 1 張），補的紀錄留著但不再連到帳單", async () => {
    const { card } = await cardWithBills();
    const taishin = await insertAccount({ name: "台新卡", kind: "credit", statementDay: 10 });
    const seed = async (cardId: number, day: string, count: number) => {
      const rows = await getDb()
        .insert(savingsCardBills)
        .values(Array.from({ length: count }, (_, i) => ({ userId: me, accountId: cardId, statementDate: `2026-${String(i + 1).padStart(2, "0")}-${day}`, dueDate: `2026-${String(i + 1).padStart(2, "0")}-28`, amount: 100 })))
        .returning();
      await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: cardId, amount: 100, date: rows[0].statementDate, cardBillId: rows[0].id });
      return rows;
    };
    const cathayBills = await seed(card.id, "05", 7);
    const taishinBills = await seed(taishin.id, "10", 6);

    expect(await postDueRecurring(NOW)).toBe("自動記帳 0 筆；清掉 3 張舊帳單");

    const left = await bills();
    expect(left.filter((b) => b.accountId === card.id).map((b) => b.id)).toEqual(cathayBills.slice(2).map((b) => b.id));
    expect(left.filter((b) => b.accountId === taishin.id).map((b) => b.id)).toEqual(taishinBills.slice(1).map((b) => b.id));
    expect((await transactions()).map((t) => [t.accountId, t.amount, t.cardBillId])).toEqual([
      [card.id, 100, null],
      [taishin.id, 100, null],
    ]);
  });
});
