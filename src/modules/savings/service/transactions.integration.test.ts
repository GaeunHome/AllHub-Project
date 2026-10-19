import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { savingsHoldings, savingsRecurring, savingsTransactions } from "../data/schema";
import { dateParams, logQueries, pgliteOf, savingsRows } from "../dev/db-fixtures";
import { userError } from "../dev/fixtures";
import {
  accountMonthFlows,
  addTransaction,
  allocateSalary,
  categoryMonthTotals,
  deleteTransaction,
  listMonthTransactions,
  updateBalance,
  updateTransaction,
  type SalaryFields,
  type TransactionFields,
} from "./transactions";

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

// 台北時間 2026-10-14 中午
const NOW = new Date("2026-10-14T04:00:00Z");
const TODAY = "2026-10-14";
/** 台北時間那天中午 */
const noonOf = (date: string) => new Date(`${date}T04:00:00Z`);
// 紀錄不能早於建立帳戶那天 測其他規則時帳戶預設很早就開始記帳
// 用固定的日期 不跟著真的時鐘
const LONG_AGO = noonOf("2020-01-01");

const ACCOUNT_NOT_FOUND = "找不到這個帳戶，可能已經刪除了";
const CATEGORY_NOT_FOUND = "找不到這個分類，可能已經刪除了";
const TRANSACTION_NOT_FOUND = "找不到這筆紀錄，可能已經刪除了";
const INACTIVE = "這個帳戶已停用，請先恢復";
const KIND_MISMATCH = "分類跟收支類型不符";

const { insertAccount, insertCategory, insertTransaction } = savingsRows(getDb, () => me, { account: { createdAt: LONG_AGO } });

const allRows = () => getDb().select().from(savingsTransactions).orderBy(asc(savingsTransactions.id));
const rowsOf = (userId: string) => getDb().select().from(savingsTransactions).where(eq(savingsTransactions.userId, userId)).orderBy(asc(savingsTransactions.id));

const entry = (values: Partial<TransactionFields> = {}): TransactionFields => ({
  kind: "expense",
  accountId: "",
  counterAccountId: "",
  categoryId: "",
  amount: "120",
  date: "2026-10-13",
  note: "",
  ...values,
});

describe("listMonthTransactions（某個月的紀錄）", () => {
  it("只有那個月、只有自己的_日期新的在前、同一天後記的在前_帶帳戶與分類的名稱", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const food = await insertCategory({ name: "餐飲", color: "orange" });
    const theirs = await insertAccount({ name: "別人的", userId: other });
    const first = await insertTransaction({ accountId: cathay.id, categoryId: food.id, amount: 120, date: "2026-10-01", note: "早餐" });
    const transfer = await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: post.id, amount: 2500, date: "2026-10-31" });
    const second = await insertTransaction({ accountId: post.id, amount: 80, date: "2026-10-01" });
    await insertTransaction({ accountId: cathay.id, amount: 1, date: "2026-09-30" });
    await insertTransaction({ accountId: cathay.id, amount: 2, date: "2026-11-01" });
    await insertTransaction({ userId: other, accountId: theirs.id, amount: 3, date: "2026-10-15" });

    const rows = await listMonthTransactions(me, "2026-10");

    expect(rows.map((row) => row.id)).toEqual([transfer.id, second.id, first.id]);
    expect(rows[0]).toMatchObject({ kind: "transfer", accountName: "國泰", counterAccountName: "郵局", categoryName: null, recurring: false, amount: 2500 });
    expect(rows[2]).toMatchObject({ accountName: "國泰", counterAccountName: null, categoryName: "餐飲", note: "早餐", date: "2026-10-01" });
  });

  it("固定收支自動記的_recurring 是 true", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const [rule] = await getDb().insert(savingsRecurring).values({ userId: me, kind: "expense", accountId: cathay.id, amount: 390, dayOfMonth: 6 }).returning();
    await insertTransaction({ accountId: cathay.id, amount: 390, date: "2026-10-06", recurringId: rule.id });

    expect((await listMonthTransactions(me, "2026-10")).map((row) => row.recurring)).toEqual([true]);
  });

  it("月份格式不對_回空清單（不會讓資料庫丟錯）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertTransaction({ accountId: cathay.id, amount: 1, date: "2026-10-01" });

    expect(await listMonthTransactions(me, "2026-13")).toEqual([]);
    expect(await listMonthTransactions(me, "abc")).toEqual([]);
  });
});

describe("accountMonthFlows（每個帳戶每個月的流量）", () => {
  it("收入、支出、調整算在帳戶上_轉帳的轉出算在轉出帳戶、轉入算在轉入帳戶_月份是 YYYY-MM_只有自己的", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const theirs = await insertAccount({ name: "別人的", userId: other });
    await insertTransaction({ kind: "income", accountId: cathay.id, amount: 43_000, date: "2026-10-05" });
    await insertTransaction({ kind: "expense", accountId: cathay.id, amount: 120, date: "2026-10-06" });
    await insertTransaction({ kind: "expense", accountId: cathay.id, amount: 80, date: "2026-10-07" });
    await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: post.id, amount: 5000, date: "2026-10-05" });
    await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: -350, date: "2026-10-08" });
    await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: 50, date: "2026-10-09" });
    await insertTransaction({ kind: "transfer", accountId: post.id, counterAccountId: cathay.id, amount: 700, date: "2026-09-30" });
    await insertTransaction({ userId: other, accountId: theirs.id, amount: 999, date: "2026-10-05" });

    const flows = await accountMonthFlows(me);

    expect(flows).toHaveLength(4);
    expect(flows).toEqual(
      expect.arrayContaining([
        { accountId: cathay.id, month: "2026-10", income: 43_000, expense: 200, transferIn: 0, transferOut: 5000, adjust: -300 },
        { accountId: post.id, month: "2026-10", income: 0, expense: 0, transferIn: 5000, transferOut: 0, adjust: 0 },
        { accountId: post.id, month: "2026-09", income: 0, expense: 0, transferIn: 0, transferOut: 700, adjust: 0 },
        { accountId: cathay.id, month: "2026-09", income: 0, expense: 0, transferIn: 700, transferOut: 0, adjust: 0 },
      ]),
    );
    expect(await accountMonthFlows(other)).toEqual([{ accountId: theirs.id, month: "2026-10", income: 0, expense: 999, transferIn: 0, transferOut: 0, adjust: 0 }]);
  });

  it("加總超過 int 上限（約 21 億）_仍是正確的數字", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await getDb()
      .insert(savingsTransactions)
      .values(Array.from({ length: 30 }, () => ({ userId: me, kind: "income" as const, accountId: cathay.id, amount: 100_000_000, date: "2026-10-01" })));

    expect(await accountMonthFlows(me)).toEqual([{ accountId: cathay.id, month: "2026-10", income: 3_000_000_000, expense: 0, transferIn: 0, transferOut: 0, adjust: 0 }]);
  });

  it("沒有紀錄_空清單", async () => {
    await insertAccount({ name: "國泰" });

    expect(await accountMonthFlows(me)).toEqual([]);
  });
});

describe("categoryMonthTotals（每個分類每個月的合計）", () => {
  it("只有收入與支出_未分類是 null_依分類、類型與月份加總_只有自己的", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const food = await insertCategory({ name: "餐飲" });
    const salary = await insertCategory({ name: "薪水", kind: "income", color: "green" });
    const theirs = await insertAccount({ name: "別人的", userId: other });
    await insertTransaction({ accountId: cathay.id, categoryId: food.id, amount: 120, date: "2026-10-06" });
    await insertTransaction({ accountId: post.id, categoryId: food.id, amount: 80, date: "2026-10-20" });
    await insertTransaction({ accountId: cathay.id, amount: 50, date: "2026-10-21" });
    await insertTransaction({ kind: "income", accountId: cathay.id, amount: 300, date: "2026-10-21" });
    await insertTransaction({ kind: "income", accountId: cathay.id, categoryId: salary.id, amount: 43_000, date: "2026-09-05" });
    await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: post.id, amount: 5000, date: "2026-10-05" });
    await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: -350, date: "2026-10-08" });
    await insertTransaction({ userId: other, accountId: theirs.id, amount: 999, date: "2026-10-05" });

    const totals = await categoryMonthTotals(me);

    expect(totals).toHaveLength(4);
    expect(totals).toEqual(
      expect.arrayContaining([
        { categoryId: food.id, kind: "expense", month: "2026-10", amount: 200 },
        { categoryId: null, kind: "expense", month: "2026-10", amount: 50 },
        { categoryId: null, kind: "income", month: "2026-10", amount: 300 },
        { categoryId: salary.id, kind: "income", month: "2026-09", amount: 43_000 },
      ]),
    );
    expect(await categoryMonthTotals(other)).toEqual([{ categoryId: null, kind: "expense", month: "2026-10", amount: 999 }]);
  });
});

describe("排序用的建立順序", () => {
  it("同一天的紀錄依 id 由新到舊（同一個交易裡建立的時間一樣，不能只看 created_at）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const createdAt = new Date("2026-10-06T04:00:00Z");
    const ids: number[] = [];
    for (const amount of [1, 2, 3]) ids.push((await insertTransaction({ accountId: cathay.id, amount, date: "2026-10-06", createdAt })).id);

    expect((await listMonthTransactions(me, "2026-10")).map((row) => row.id)).toEqual([...ids].reverse());
    expect((await getDb().select().from(savingsTransactions).where(eq(savingsTransactions.userId, me)).orderBy(asc(savingsTransactions.id))).map((row) => row.amount)).toEqual([1, 2, 3]);
  });
});

describe("addTransaction（記一筆）", () => {
  it("支出_帶分類與備註_記在登入者名下", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const food = await insertCategory({ name: "餐飲" });

    const row = await addTransaction(me, entry({ accountId: String(cathay.id), categoryId: String(food.id), note: " 午餐 " }), NOW);

    expect(row).toMatchObject({ userId: me, kind: "expense", accountId: cathay.id, counterAccountId: null, categoryId: food.id, amount: 120, date: "2026-10-13", note: "午餐", recurringId: null });
    expect(await allRows()).toHaveLength(1);
  });

  it("收入_分類留空是未分類", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await addTransaction(me, entry({ kind: "income", accountId: String(cathay.id), amount: "43,000", date: TODAY }), NOW)).toMatchObject({
      kind: "income",
      categoryId: null,
      amount: 43_000,
      date: TODAY,
    });
  });

  it("轉帳_寫上轉入帳戶_送來的分類忽略", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const food = await insertCategory({ name: "餐飲" });

    expect(await addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(post.id), categoryId: String(food.id) }), NOW)).toMatchObject({
      kind: "transfer",
      accountId: cathay.id,
      counterAccountId: post.id,
      categoryId: null,
    });
  });

  it("刷信用卡（信用卡的支出）與繳卡費（存款轉到信用卡）都可以", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const card = await insertAccount({ name: "國泰信用卡", kind: "credit" });

    await addTransaction(me, entry({ accountId: String(card.id) }), NOW);
    await addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(card.id) }), NOW);

    expect((await allRows()).map((t) => [t.kind, t.accountId, t.counterAccountId])).toEqual([
      ["expense", card.id, null],
      ["transfer", cathay.id, card.id],
    ]);
  });

  it("台北已經是 10/15（UTC 還在 10/14）_可以記 10/15", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect((await addTransaction(me, entry({ accountId: String(cathay.id), date: "2026-10-15" }), new Date("2026-10-14T16:30:00Z"))).date).toBe("2026-10-15");
  });

  it("未來的日期_丟使用者錯誤_沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(addTransaction(me, entry({ accountId: String(cathay.id), date: "2026-10-15" }), NOW))).toBe("不能記錄未來的日期");
    expect(await allRows()).toEqual([]);
  });

  it("金額不合法_丟使用者錯誤_沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    await userError(addTransaction(me, entry({ accountId: String(cathay.id), amount: "12.5" }), NOW));
    expect(await allRows()).toEqual([]);
  });

  it("帳戶或轉入帳戶不存在_找不到帳戶", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(addTransaction(me, entry({ accountId: "999" }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: "999" }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await allRows()).toEqual([]);
  });

  it("帳戶或轉入帳戶停用了_請先恢復_沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });

    expect(await userError(addTransaction(me, entry({ accountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(closed.id), counterAccountId: String(cathay.id) }), NOW))).toBe(INACTIVE);
    expect(await allRows()).toEqual([]);
  });

  it("分類不存在_找不到分類", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(addTransaction(me, entry({ accountId: String(cathay.id), categoryId: "999" }), NOW))).toBe(CATEGORY_NOT_FOUND);
  });

  it("收入選了支出的分類、支出選了收入的分類_分類跟收支類型不符", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const food = await insertCategory({ name: "餐飲" });
    const salary = await insertCategory({ name: "薪水", kind: "income", color: "green" });

    expect(await userError(addTransaction(me, entry({ kind: "income", accountId: String(cathay.id), categoryId: String(food.id) }), NOW))).toBe(KIND_MISMATCH);
    expect(await userError(addTransaction(me, entry({ accountId: String(cathay.id), categoryId: String(salary.id) }), NOW))).toBe(KIND_MISMATCH);
    expect(await allRows()).toEqual([]);
  });
});

describe("updateTransaction（修改紀錄）", () => {
  it("改金額、日期、分類與備註_固定收支自動記的標記留著", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const food = await insertCategory({ name: "餐飲" });
    const [rule] = await getDb().insert(savingsRecurring).values({ userId: me, kind: "expense", accountId: cathay.id, amount: 390, dayOfMonth: 6 }).returning();
    const row = await insertTransaction({ accountId: cathay.id, amount: 390, date: "2026-10-06", recurringId: rule.id });

    const updated = await updateTransaction(me, row.id, entry({ accountId: String(cathay.id), categoryId: String(food.id), amount: "420", date: "2026-10-07", note: "漲價了" }), NOW);

    expect(updated).toMatchObject({ id: row.id, kind: "expense", categoryId: food.id, amount: 420, date: "2026-10-07", note: "漲價了", recurringId: rule.id });
    expect(await allRows()).toMatchObject([{ amount: 420, recurringId: rule.id }]);
  });

  it("支出改成轉帳_分類清掉、寫上轉入帳戶；再改成收入_轉入帳戶清掉", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const food = await insertCategory({ name: "餐飲" });
    const row = await insertTransaction({ accountId: cathay.id, categoryId: food.id, amount: 100, date: "2026-10-01" });

    expect(await updateTransaction(me, row.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(post.id), categoryId: String(food.id) }), NOW)).toMatchObject({
      kind: "transfer",
      counterAccountId: post.id,
      categoryId: null,
    });
    expect(await updateTransaction(me, row.id, entry({ kind: "income", accountId: String(post.id), counterAccountId: String(cathay.id) }), NOW)).toMatchObject({
      kind: "income",
      accountId: post.id,
      counterAccountId: null,
    });
  });

  it("更新餘額的調整_不能修改_資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const adjust = await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: -350, date: "2026-10-10" });

    expect(await userError(updateTransaction(me, adjust.id, entry({ accountId: String(cathay.id) }), NOW))).toBe("更新餘額的調整不能修改，可以刪除後再更新一次餘額");
    expect(await allRows()).toMatchObject([{ kind: "adjust", amount: -350 }]);
  });

  it.each([999, 2_147_483_648])("紀錄 %i 不存在_找不到紀錄", async (id) => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await userError(updateTransaction(me, id, entry({ accountId: String(cathay.id) }), NOW))).toBe(TRANSACTION_NOT_FOUND);
  });

  it("紀錄所在的帳戶已經停用_照樣可以改（例如改備註）；轉帳的另一邊停用了也一樣", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const alsoClosed = await insertAccount({ name: "另一個舊帳戶", active: false });
    const expense = await insertTransaction({ accountId: closed.id, amount: 100, date: "2026-01-01" });
    const transfer = await insertTransaction({ kind: "transfer", accountId: closed.id, counterAccountId: alsoClosed.id, amount: 200, date: "2026-01-01" });

    await updateTransaction(me, expense.id, entry({ accountId: String(closed.id), amount: "100", date: "2026-01-01", note: "補備註" }), NOW);
    await updateTransaction(me, transfer.id, entry({ kind: "transfer", accountId: String(alsoClosed.id), counterAccountId: String(closed.id), amount: "250", date: "2026-01-01" }), NOW);

    expect((await allRows()).map((t) => [t.note, t.amount, t.accountId])).toEqual([
      ["補備註", 100, closed.id],
      [null, 250, alsoClosed.id],
    ]);
  });

  it("改到另一個停用的帳戶_請先恢復_資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const row = await insertTransaction({ accountId: cathay.id, amount: 100, date: "2026-10-01" });

    expect(await userError(updateTransaction(me, row.id, entry({ accountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await userError(updateTransaction(me, row.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await allRows()).toMatchObject([{ kind: "expense", accountId: cathay.id, amount: 100 }]);
  });

  it("未來的日期或分類類型不符_丟使用者錯誤_資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const salary = await insertCategory({ name: "薪水", kind: "income", color: "green" });
    const row = await insertTransaction({ accountId: cathay.id, amount: 100, date: "2026-10-01" });

    expect(await userError(updateTransaction(me, row.id, entry({ accountId: String(cathay.id), date: "2026-10-15" }), NOW))).toBe("不能記錄未來的日期");
    expect(await userError(updateTransaction(me, row.id, entry({ accountId: String(cathay.id), categoryId: String(salary.id) }), NOW))).toBe(KIND_MISMATCH);
    expect(await allRows()).toMatchObject([{ date: "2026-10-01", categoryId: null }]);
  });
});

describe("deleteTransaction", () => {
  it("刪掉自己的紀錄（調整也可以刪）_回傳 true", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const expense = await insertTransaction({ accountId: cathay.id, amount: 100, date: "2026-10-01" });
    const adjust = await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: 50, date: "2026-10-02" });
    const keep = await insertTransaction({ accountId: cathay.id, amount: 300, date: "2026-10-03" });

    expect(await deleteTransaction(me, expense.id)).toBe(true);
    expect(await deleteTransaction(me, adjust.id)).toBe(true);

    expect((await allRows()).map((t) => t.id)).toEqual([keep.id]);
  });

  it.each([999, 2_147_483_648])("紀錄 %i 不存在_回傳 false", async (id) => {
    expect(await deleteTransaction(me, id)).toBe(false);
  });
});

describe("updateBalance（更新餘額）", () => {
  async function depositWithHistory() {
    const cathay = await insertAccount({ name: "國泰", openingBalance: 10_000 });
    const post = await insertAccount({ name: "郵局" });
    await insertTransaction({ kind: "income", accountId: cathay.id, amount: 5000, date: "2026-10-01" });
    await insertTransaction({ kind: "expense", accountId: cathay.id, amount: 1200, date: "2026-10-02" });
    await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: post.id, amount: 2000, date: "2026-10-03" });
    await insertTransaction({ kind: "transfer", accountId: post.id, counterAccountId: cathay.id, amount: 500, date: "2026-10-04" });
    // 起始 10,000 加收入 5,000 減支出 1,200 減轉出 2,000 加轉入 500 是 12,300
    return cathay;
  }

  it("存款_實際餘額跟記錄的差額記成一筆今天的調整_回傳帳戶與差額", async () => {
    const cathay = await depositWithHistory();

    const result = await updateBalance(me, { accountId: String(cathay.id), actual: "12,000" }, NOW);

    expect(result).toMatchObject({ account: { id: cathay.id, name: "國泰" }, delta: -300 });
    expect((await allRows()).at(-1)).toMatchObject({ userId: me, kind: "adjust", accountId: cathay.id, counterAccountId: null, categoryId: null, amount: -300, date: TODAY, note: null });
  });

  it("餘額一樣_差額 0_不寫入", async () => {
    const cathay = await depositWithHistory();

    expect((await updateBalance(me, { accountId: String(cathay.id), actual: "12300" }, NOW)).delta).toBe(0);
    expect((await allRows()).filter((t) => t.kind === "adjust")).toEqual([]);
  });

  it("之前的調整也算進餘額", async () => {
    const cathay = await depositWithHistory();
    await insertTransaction({ kind: "adjust", accountId: cathay.id, amount: -300, date: "2026-10-05" });

    expect((await updateBalance(me, { accountId: String(cathay.id), actual: "12000" }, NOW)).delta).toBe(0);
  });

  it("信用卡不能更新餘額（刷卡記一筆、繳款用繳卡費）_不寫入", async () => {
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -3500 });

    expect(await userError(updateBalance(me, { accountId: String(card.id), actual: "1,800" }, NOW))).toContain("信用卡");
    expect(await allRows()).toEqual([]);
  });

  it("有持股的投資帳戶不能更新市值（市值照股價算）_不寫入；沒有持股的照常", async () => {
    const broker = await insertAccount({ name: "證券", kind: "investment", openingBalance: 80_000 });
    const plain = await insertAccount({ name: "沒有持股的證券", kind: "investment", openingBalance: 80_000 });
    await getDb().insert(savingsHoldings).values({ userId: me, accountId: broker.id, symbol: "006208", name: "富邦台50", shares: 10, cost: 2500 });

    expect(await userError(updateBalance(me, { accountId: String(broker.id), actual: "95000" }, NOW))).toContain("持股");
    expect(await allRows()).toEqual([]);
    expect((await updateBalance(me, { accountId: String(plain.id), actual: "95000" }, NOW)).delta).toBe(15_000);
  });

  it("存款與投資不能輸入負數_不寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });

    expect(await userError(updateBalance(me, { accountId: String(cathay.id), actual: "-5" }, NOW))).toContain("負數");
    expect(await userError(updateBalance(me, { accountId: String(broker.id), actual: "-5" }, NOW))).toContain("負數");
    expect(await allRows()).toEqual([]);
  });

  it("投資_輸入目前市值", async () => {
    const broker = await insertAccount({ name: "證券", kind: "investment", openingBalance: 80_000, openingCost: 75_000 });
    const cathay = await insertAccount({ name: "國泰" });
    await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, amount: 10_000, date: "2026-10-05" });

    expect((await updateBalance(me, { accountId: String(broker.id), actual: "95000" }, NOW)).delta).toBe(5000);
  });

  it("調整的日期是台北時間的今天", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    await updateBalance(me, { accountId: String(cathay.id), actual: "100" }, new Date("2026-10-14T16:30:00Z"));

    expect((await allRows())[0].date).toBe("2026-10-15");
  });

  it("帳戶不存在_找不到帳戶；停用了_請先恢復；都不寫入", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });

    expect(await userError(updateBalance(me, { accountId: "999", actual: "1" }, NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(updateBalance(me, { accountId: String(closed.id), actual: "1" }, NOW))).toBe(INACTIVE);
    expect(await allRows()).toEqual([]);
  });

  it("金額不合法_丟使用者錯誤", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    await userError(updateBalance(me, { accountId: String(cathay.id), actual: "" }, NOW));
  });

  it("差額超過 1 億元（一筆調整放不下）_丟使用者錯誤_不寫入", async () => {
    const cathay = await insertAccount({ name: "國泰", openingBalance: -50_000_000 });

    expect(await userError(updateBalance(me, { accountId: String(cathay.id), actual: "60000000" }, NOW))).toBe("跟目前的餘額差超過 1 億元，請確認輸入的金額");
    expect(await allRows()).toEqual([]);
  });

  it("同時按了兩次一樣的金額_只記一筆調整", async () => {
    const cathay = await depositWithHistory();

    const results = await Promise.all([1, 2].map(() => updateBalance(me, { accountId: String(cathay.id), actual: "12000" }, NOW)));

    expect(results.map((r) => r.delta).sort()).toEqual([-300, 0]);
    expect((await allRows()).filter((t) => t.kind === "adjust").map((t) => t.amount)).toEqual([-300]);
  });

  it("算餘額之前先在交易裡鎖住帳戶（for update）：同時有人記帳或更新餘額時，等前一個寫完才算；PGlite 只有一條連線，所以直接看送出的 SQL", async () => {
    const cathay = await depositWithHistory();
    const queries = logQueries(getDb());

    await updateBalance(me, { accountId: String(cathay.id), actual: "12000" }, NOW);

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "savings_accounts" where .* for update$/i.test(query));
    const sum = queries.findIndex((query) => /sum\(.*from "savings_transactions"/i.test(query));
    const adjust = queries.findIndex((query) => /^insert into "savings_transactions"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(sum).toBeGreaterThan(lock);
    expect(adjust).toBeGreaterThan(sum);
  });
});

describe("allocateSalary（發薪分配）", () => {
  async function accounts() {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const card = await insertAccount({ name: "卡", kind: "credit" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const salary = await insertCategory({ name: "薪水", kind: "income", color: "green" });
    const food = await insertCategory({ name: "餐飲" });
    return { cathay, post, broker, card, closed, salary, food };
  }

  const salaryFields = (values: Partial<SalaryFields> & { accountId: string }): SalaryFields => ({ categoryId: "", amount: "43,000", date: "2026-10-05", note: "", transfers: [], ...values });

  it("薪水記成入帳帳戶的一筆收入，再照分配轉出（備註是發薪分配）_金額 0 的略過_回傳剩下的", async () => {
    const { cathay, post, broker, salary } = await accounts();

    const result = await allocateSalary(
      me,
      salaryFields({
        accountId: String(cathay.id),
        categoryId: String(salary.id),
        note: "十月薪水",
        transfers: [
          { accountId: String(post.id), amount: "5,000" },
          { accountId: String(broker.id), amount: "6000" },
          { accountId: String(post.id), amount: "0" },
        ],
      }),
      NOW,
    );

    expect(result.remainder).toBe(32_000);
    expect(result.income).toMatchObject({ userId: me, kind: "income", accountId: cathay.id, categoryId: salary.id, amount: 43_000, date: "2026-10-05", note: "十月薪水" });
    expect(result.transfers.map((t) => [t.kind, t.accountId, t.counterAccountId, t.amount, t.date, t.note])).toEqual([
      ["transfer", cathay.id, post.id, 5000, "2026-10-05", "發薪分配"],
      ["transfer", cathay.id, broker.id, 6000, "2026-10-05", "發薪分配"],
    ]);
    expect((await allRows()).map((t) => t.id)).toEqual([result.income.id, ...result.transfers.map((t) => t.id)]);
  });

  it("沒有分配_只記收入_分類可以留空_全部留在入帳帳戶", async () => {
    const { cathay } = await accounts();

    const result = await allocateSalary(me, salaryFields({ accountId: String(cathay.id) }), NOW);

    expect(result).toMatchObject({ transfers: [], remainder: 43_000, income: { categoryId: null, note: null } });
    expect(await allRows()).toHaveLength(1);
  });

  it("分出去的超過薪水_丟使用者錯誤_什麼都不寫入", async () => {
    const { cathay, post } = await accounts();

    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(cathay.id), amount: "1000", transfers: [{ accountId: String(post.id), amount: "1001" }] }), NOW))).toBe(
      "分出去的金額超過薪水了",
    );
    expect(await allRows()).toEqual([]);
  });

  it("轉到信用卡、入帳帳戶自己或停用的帳戶_丟使用者錯誤_連收入也不寫入", async () => {
    const { cathay, post, card, closed } = await accounts();
    const withLine = (accountId: number) =>
      allocateSalary(
        me,
        salaryFields({
          accountId: String(cathay.id),
          transfers: [
            { accountId: String(post.id), amount: "100" },
            { accountId: String(accountId), amount: "100" },
          ],
        }),
        NOW,
      );

    expect(await userError(withLine(card.id))).toBe("發薪分配不能轉到信用卡");
    expect(await userError(withLine(cathay.id))).toBe("轉出和轉入不能是同一個帳戶");
    expect(await userError(withLine(closed.id))).toBe(INACTIVE);
    expect(await userError(withLine(999))).toBe(ACCOUNT_NOT_FOUND);
    expect(await allRows()).toEqual([]);
  });

  it("入帳帳戶停用了、分類是支出的或日期在未來_丟使用者錯誤_什麼都不寫入", async () => {
    const { cathay, closed, food } = await accounts();

    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(closed.id) }), NOW))).toBe(INACTIVE);
    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(cathay.id), categoryId: String(food.id) }), NOW))).toBe(KIND_MISMATCH);
    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(cathay.id), date: "2026-10-15" }), NOW))).toBe("不能記錄未來的日期");
    expect(await allRows()).toEqual([]);
  });

  it("入帳帳戶是信用卡_薪水要入帳到存款或投資帳戶_什麼都不寫入", async () => {
    const { card, post, broker } = await accounts();

    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(card.id), transfers: [{ accountId: String(post.id), amount: "100" }] }), NOW))).toBe("薪水要入帳到存款或投資帳戶");
    expect(await allRows()).toEqual([]);
    // 投資帳戶可以入帳
    expect((await allocateSalary(me, salaryFields({ accountId: String(broker.id) }), NOW)).income.accountId).toBe(broker.id);
  });

  it("同一個帳戶分配兩次_表單被改過，丟使用者錯誤_什麼都不寫入", async () => {
    const { cathay, post } = await accounts();
    const twice = salaryFields({
      accountId: String(cathay.id),
      transfers: [
        { accountId: String(post.id), amount: "100" },
        { accountId: String(post.id), amount: "100" },
      ],
    });

    expect(await userError(allocateSalary(me, twice, NOW))).toBe("分配的帳戶不正確，請重新整理頁面再試一次");
    expect(await allRows()).toEqual([]);
  });

  it("分配的行數比自己的帳戶還多（別人的帳戶不算）_丟使用者錯誤_什麼都不寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    for (const name of ["別人的 1", "別人的 2", "別人的 3"]) await insertAccount({ name, userId: other });
    const lines = (count: number) => [{ accountId: String(post.id), amount: "100" }, ...Array.from({ length: count - 1 }, (_, i) => ({ accountId: String(9000 + i), amount: "0" }))];

    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(cathay.id), transfers: lines(3) }), NOW))).toBe("分配的帳戶不正確，請重新整理頁面再試一次");
    expect(await allRows()).toEqual([]);
    expect((await allocateSalary(me, salaryFields({ accountId: String(cathay.id), transfers: lines(2) }), NOW)).transfers).toHaveLength(1);
  });

  it("分配金額不合法_錯誤寫出是分配給哪個帳戶_什麼都不寫入", async () => {
    const { cathay, post } = await accounts();

    expect(await userError(allocateSalary(me, salaryFields({ accountId: String(cathay.id), transfers: [{ accountId: String(post.id), amount: "1.5" }] }), NOW))).toBe(
      "分配給「郵局」的金額：金額只能是整數（單位：元，不能有小數或負數）",
    );
    expect(await allRows()).toEqual([]);
  });

  it("檢查與寫入前先在交易裡鎖住用到的帳戶（for share）：同時停用或刪除帳戶時等這次寫完；PGlite 只有一條連線，所以直接看送出的 SQL", async () => {
    const { cathay, post } = await accounts();
    const queries = logQueries(getDb());

    await allocateSalary(me, salaryFields({ accountId: String(cathay.id), transfers: [{ accountId: String(post.id), amount: "100" }] }), NOW);

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "savings_accounts" where .* for share$/i.test(query));
    const insert = queries.findIndex((query) => /^insert into "savings_transactions"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(lock);
    expect(queries.filter((query) => /^insert into "savings_transactions"/i.test(query))).toHaveLength(2);
  });
});

describe("紀錄的日期不能早於帳戶開始記帳的那天（建立帳戶的台北日期；起始餘額是那天的餘額）", () => {
  const BEFORE_CATHAY = "「國泰」從 10 月 14 日開始記帳，日期不能更早";

  /** 國泰 10/14 才開始記帳 郵局很早就開始了 */
  async function accounts() {
    const cathay = await insertAccount({ name: "國泰", openingBalance: 52_000, createdAt: noonOf("2026-10-14") });
    const post = await insertAccount({ name: "郵局" });
    return { cathay, post };
  }

  it("記一筆 9/20 的支出到 10/14 建立的帳戶_丟使用者錯誤（寫出帳戶名稱與開始記帳的日期）_沒有寫入", async () => {
    const { cathay } = await accounts();

    expect(await userError(addTransaction(me, entry({ accountId: String(cathay.id), date: "2026-09-20", amount: "350" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await userError(addTransaction(me, entry({ kind: "income", accountId: String(cathay.id), date: "2026-10-13" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await allRows()).toEqual([]);
  });

  it("日期就是建立的那天_可以", async () => {
    const { cathay } = await accounts();

    expect(await addTransaction(me, entry({ accountId: String(cathay.id), date: TODAY }), NOW)).toMatchObject({ accountId: cathay.id, date: TODAY });
  });

  it("建立的那天以台北時間為準（UTC 10/13 16:30 建立是台北 10/14）_10/13 不行、10/14 可以", async () => {
    const lateNight = await insertAccount({ name: "台新", createdAt: new Date("2026-10-13T16:30:00Z") });

    expect(await userError(addTransaction(me, entry({ accountId: String(lateNight.id), date: "2026-10-13" }), NOW))).toBe("「台新」從 10 月 14 日開始記帳，日期不能更早");
    expect((await addTransaction(me, entry({ accountId: String(lateNight.id), date: TODAY }), NOW)).date).toBe(TODAY);
  });

  it("轉帳_轉出或轉入的帳戶任一個還沒開始記帳都不行，訊息寫出是哪一個_沒有寫入", async () => {
    const { cathay, post } = await accounts();

    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(post.id), counterAccountId: String(cathay.id), date: "2026-09-20" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(post.id), date: "2026-09-20" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await allRows()).toEqual([]);
    expect(await addTransaction(me, entry({ kind: "transfer", accountId: String(post.id), counterAccountId: String(cathay.id), date: TODAY }), NOW)).toMatchObject({ kind: "transfer", date: TODAY });
  });

  it("修改紀錄_日期改到開始記帳之前、或改到還沒開始記帳的帳戶（含轉入帳戶）_丟使用者錯誤_資料不變", async () => {
    const { cathay, post } = await accounts();
    const onCathay = await insertTransaction({ accountId: cathay.id, amount: 100, date: TODAY });
    const onPost = await insertTransaction({ accountId: post.id, amount: 200, date: "2026-09-20" });

    expect(await userError(updateTransaction(me, onCathay.id, entry({ accountId: String(cathay.id), date: "2026-09-20" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await userError(updateTransaction(me, onPost.id, entry({ accountId: String(cathay.id), date: "2026-09-20" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await userError(updateTransaction(me, onPost.id, entry({ kind: "transfer", accountId: String(post.id), counterAccountId: String(cathay.id), date: "2026-09-20" }), NOW))).toBe(BEFORE_CATHAY);
    expect((await allRows()).map((t) => [t.kind, t.accountId, t.counterAccountId, t.date])).toEqual([
      ["expense", cathay.id, null, TODAY],
      ["expense", post.id, null, "2026-09-20"],
    ]);
  });

  it("開始記帳之前的舊紀錄（這條規則之前記的）_修改時也要改成開始記帳之後的日期；刪除照樣可以", async () => {
    const { cathay } = await accounts();
    const legacy = await insertTransaction({ accountId: cathay.id, amount: 350, date: "2026-09-20" });

    expect(await userError(updateTransaction(me, legacy.id, entry({ accountId: String(cathay.id), amount: "350", date: "2026-09-20", note: "補備註" }), NOW))).toBe(BEFORE_CATHAY);
    expect(await updateTransaction(me, legacy.id, entry({ accountId: String(cathay.id), amount: "350", date: TODAY }), NOW)).toMatchObject({ date: TODAY });
    expect(await deleteTransaction(me, legacy.id)).toBe(true);
  });

  it("發薪分配_入帳帳戶還沒開始記帳_丟使用者錯誤_什麼都不寫入", async () => {
    const { cathay, post } = await accounts();

    expect(await userError(allocateSalary(me, { accountId: String(cathay.id), categoryId: "", amount: "43,000", date: "2026-10-05", note: "", transfers: [{ accountId: String(post.id), amount: "100" }] }, NOW))).toBe(
      "「國泰」從 10 月 14 日開始記帳，日期不能更早",
    );
    expect(await allRows()).toEqual([]);
  });

  it("發薪分配_轉入的帳戶有一個還沒開始記帳_丟使用者錯誤（寫出是哪一個）_連收入也不寫入；日期是開始記帳那天就可以", async () => {
    const { cathay, post } = await accounts();
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const salary = (date: string): SalaryFields => ({
      accountId: String(post.id),
      categoryId: "",
      amount: "43,000",
      date,
      note: "",
      transfers: [
        { accountId: String(broker.id), amount: "5000" },
        { accountId: String(cathay.id), amount: "100" },
      ],
    });

    expect(await userError(allocateSalary(me, salary("2026-10-05"), NOW))).toBe(BEFORE_CATHAY);
    expect(await allRows()).toEqual([]);
    expect((await allocateSalary(me, salary(TODAY), NOW)).transfers).toHaveLength(2);
  });

  it("別人的帳戶（比紀錄的日期晚建立）_當作找不到，不寫出別人帳戶的名稱與日期", async () => {
    const { post } = await accounts();
    const theirs = await insertAccount({ name: "別人的秘密帳戶", userId: other, createdAt: noonOf("2026-10-14") });

    const messages = [
      await userError(addTransaction(me, entry({ accountId: String(theirs.id), date: "2026-09-20" }), NOW)),
      await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(post.id), counterAccountId: String(theirs.id), date: "2026-09-20" }), NOW)),
      await userError(allocateSalary(me, { accountId: String(post.id), categoryId: "", amount: "1000", date: "2026-09-20", note: "", transfers: [{ accountId: String(theirs.id), amount: "100" }] }, NOW)),
    ];

    expect(messages).toEqual([ACCOUNT_NOT_FOUND, ACCOUNT_NOT_FOUND, ACCOUNT_NOT_FOUND]);
    expect(await allRows()).toEqual([]);
  });
});

describe("每個人只看得到、改得到自己的紀錄", () => {
  it("記到別人的帳戶、轉到別人的帳戶或用別人的分類_當作找不到，沒有寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirCategory = await insertCategory({ name: "別人的", userId: other });

    expect(await userError(addTransaction(me, entry({ accountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(addTransaction(me, entry({ accountId: String(cathay.id), categoryId: String(theirCategory.id) }), NOW))).toBe(CATEGORY_NOT_FOUND);
    expect(await allRows()).toEqual([]);
  });

  it("修改別人的紀錄_當作找不到，資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertTransaction({ userId: other, accountId: theirAccount.id, amount: 100, date: "2026-10-01" });

    expect(await userError(updateTransaction(me, theirs.id, entry({ accountId: String(cathay.id), amount: "1" }), NOW))).toBe(TRANSACTION_NOT_FOUND);
    expect(await userError(updateTransaction(me, theirs.id, entry({ accountId: String(theirAccount.id), amount: "1" }), NOW))).toBe(TRANSACTION_NOT_FOUND);
    expect(await rowsOf(other)).toMatchObject([{ accountId: theirAccount.id, amount: 100 }]);
  });

  it("把自己的紀錄改到別人的帳戶、別人的轉入帳戶或別人的分類_當作找不到，資料不變", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirCategory = await insertCategory({ name: "別人的", userId: other });
    const mine = await insertTransaction({ accountId: cathay.id, amount: 100, date: "2026-10-01" });

    expect(await userError(updateTransaction(me, mine.id, entry({ accountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(updateTransaction(me, mine.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(updateTransaction(me, mine.id, entry({ accountId: String(cathay.id), categoryId: String(theirCategory.id) }), NOW))).toBe(CATEGORY_NOT_FOUND);
    expect(await rowsOf(me)).toMatchObject([{ kind: "expense", accountId: cathay.id, counterAccountId: null, categoryId: null, amount: 100 }]);
  });

  it("刪除別人的紀錄_回傳 false，紀錄還在", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertTransaction({ userId: other, accountId: theirAccount.id, amount: 100, date: "2026-10-01" });

    expect(await deleteTransaction(me, theirs.id)).toBe(false);
    expect(await rowsOf(other)).toHaveLength(1);
  });

  it("更新別人帳戶的餘額_當作找不到，沒有寫入", async () => {
    const theirAccount = await insertAccount({ name: "別人的", openingBalance: 500, userId: other });

    expect(await userError(updateBalance(me, { accountId: String(theirAccount.id), actual: "0" }, NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await allRows()).toEqual([]);
  });

  it("發薪分配用別人的入帳帳戶、轉到別人的帳戶或用別人的分類_當作找不到，什麼都不寫入", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirCategory = await insertCategory({ name: "別人的薪水", kind: "income", userId: other });
    const salary = (values: Partial<SalaryFields>): SalaryFields => ({ accountId: String(cathay.id), categoryId: "", amount: "1000", date: TODAY, note: "", transfers: [], ...values });

    expect(await userError(allocateSalary(me, salary({ accountId: String(theirAccount.id) }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(allocateSalary(me, salary({ transfers: [{ accountId: String(theirAccount.id), amount: "100" }] }), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await userError(allocateSalary(me, salary({ categoryId: String(theirCategory.id) }), NOW))).toBe(CATEGORY_NOT_FOUND);
    expect(await allRows()).toEqual([]);
  });

  it("發薪分配的金額錯誤訊息_分配到別人的帳戶時不寫出別人帳戶的名稱", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    await insertAccount({ name: "郵局" });
    const theirAccount = await insertAccount({ name: "別人的秘密帳戶", userId: other });

    const message = await userError(allocateSalary(me, { accountId: String(cathay.id), categoryId: "", amount: "1000", date: TODAY, note: "", transfers: [{ accountId: String(theirAccount.id), amount: "1.5" }] }, NOW));

    expect(message).toBe("分配金額：金額只能是整數（單位：元，不能有小數或負數）");
    expect(message).not.toContain("別人的秘密帳戶");
  });

  it("新紀錄一律記在登入者名下", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });

    await addTransaction(me, entry({ accountId: String(cathay.id) }), NOW);
    await updateBalance(me, { accountId: String(cathay.id), actual: "5" }, NOW);
    await allocateSalary(me, { accountId: String(cathay.id), categoryId: "", amount: "100", date: TODAY, note: "", transfers: [{ accountId: String(post.id), amount: "10" }] }, NOW);

    expect(await getDb().select().from(savingsTransactions).where(and(eq(savingsTransactions.userId, other)))).toEqual([]);
    expect(await rowsOf(me)).toHaveLength(4);
  });
});

describe("投資帳戶有持股時一般轉帳轉進轉出都擋下（市值照股價算，轉帳的錢會從總資產消失）", () => {
  const HELD = "這個投資帳戶有持股：轉進轉出請用買進或賣出";

  /** 證券有一檔 0 股的持股 市值就照持股算了 */
  async function heldBroker() {
    const cathay = await insertAccount({ name: "國泰" });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    const plain = await insertAccount({ name: "沒有持股的證券", kind: "investment" });
    await getDb().insert(savingsHoldings).values({ userId: me, accountId: broker.id, symbol: "006208", name: "富邦台50", shares: 0, cost: 0 });
    return { cathay, broker, plain };
  }
  const salary = (accountId: number, transferTo: number): SalaryFields => ({ accountId: String(accountId), categoryId: "", amount: "1000", date: TODAY, note: "", transfers: [{ accountId: String(transferTo), amount: "100" }] });

  it("記一筆轉帳_轉進或轉出有持股的投資帳戶都擋下，什麼都不寫；沒有持股的投資帳戶照常", async () => {
    const { cathay, broker, plain } = await heldBroker();

    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(broker.id) }), NOW))).toBe(HELD);
    expect(await userError(addTransaction(me, entry({ kind: "transfer", accountId: String(broker.id), counterAccountId: String(cathay.id) }), NOW))).toBe(HELD);
    expect(await allRows()).toEqual([]);
    expect(await addTransaction(me, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(plain.id) }), NOW)).toMatchObject({ counterAccountId: plain.id });
  });

  it("修改紀錄_改成轉到有持股的投資帳戶、或修改原本就轉到那裡的轉帳都擋下，資料不變；改成轉到別的帳戶可以", async () => {
    const { cathay, broker } = await heldBroker();
    const post = await insertAccount({ name: "郵局" });
    const expense = await insertTransaction({ accountId: cathay.id, amount: 100, date: "2026-10-01" });
    const old = await insertTransaction({ kind: "transfer", accountId: cathay.id, counterAccountId: broker.id, amount: 300, date: "2026-10-02" });

    expect(await userError(updateTransaction(me, expense.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(broker.id) }), NOW))).toBe(HELD);
    expect(await userError(updateTransaction(me, old.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(broker.id), amount: "500" }), NOW))).toBe(HELD);
    expect((await allRows()).map((t) => [t.kind, t.counterAccountId, t.amount])).toEqual([
      ["expense", null, 100],
      ["transfer", broker.id, 300],
    ]);
    expect(await updateTransaction(me, old.id, entry({ kind: "transfer", accountId: String(cathay.id), counterAccountId: String(post.id), amount: "300" }), NOW)).toMatchObject({ counterAccountId: post.id });
  });

  it("發薪分配_分到有持股的投資帳戶、或從有持股的投資帳戶分出去都擋下，連收入也不寫", async () => {
    const { cathay, broker, plain } = await heldBroker();

    expect(await userError(allocateSalary(me, salary(cathay.id, broker.id), NOW))).toBe(HELD);
    expect(await userError(allocateSalary(me, salary(broker.id, cathay.id), NOW))).toBe(HELD);
    expect(await allRows()).toEqual([]);
    expect((await allocateSalary(me, salary(cathay.id, plain.id), NOW)).transfers).toHaveLength(1);
  });
});

describe("送到資料庫的參數沒有 Date 物件（正式環境經 drizzle 的 postgres-js 收到 Date 會丟錯）", () => {
  it("記帳、修改、更新餘額、發薪分配", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const query = vi.spyOn(pgliteOf(getDb()), "query");

    const row = await addTransaction(me, entry({ accountId: String(cathay.id) }), NOW);
    await updateTransaction(me, row.id, entry({ accountId: String(cathay.id), amount: "1" }), NOW);
    await updateBalance(me, { accountId: String(cathay.id), actual: "5" }, NOW);
    await allocateSalary(me, { accountId: String(cathay.id), categoryId: "", amount: "100", date: TODAY, note: "", transfers: [{ accountId: String(post.id), amount: "10" }] }, NOW);
    await listMonthTransactions(me, "2026-10");

    expect(query).toHaveBeenCalled();
    expect(dateParams(query)).toEqual([]);
  });
});
