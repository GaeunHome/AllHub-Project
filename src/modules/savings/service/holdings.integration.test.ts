import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { savingsAccounts, savingsHoldings, savingsRecurring, savingsTransactions } from "../data/schema";
import type { Quote } from "../lib/quotes";
import { SavingsUserError } from "./errors";
import { addHolding, buyHolding, deleteHolding, listHoldings, sellHolding, updateHolding, type BuyFields, type QuoteLookup, type SellFields } from "./holdings";
import { deleteTransaction, updateTransaction } from "./transactions";

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-08-01T04:00:00Z");

const HOLDING_NOT_FOUND = "找不到這一檔持股，可能已經刪除了";
const ACCOUNT_NOT_FOUND = "找不到這個帳戶，可能已經刪除了";

async function insertAccount(values: Partial<typeof savingsAccounts.$inferInsert> & { name: string }) {
  const [row] = await getDb().insert(savingsAccounts).values({ userId: me, kind: "deposit", createdAt: CREATED, ...values }).returning();
  return row;
}

async function insertHolding(values: Partial<typeof savingsHoldings.$inferInsert> & { accountId: number }) {
  const [row] = await getDb().insert(savingsHoldings).values({ userId: me, symbol: "006208", name: "富邦台50", shares: 12, cost: 3000, ...values }).returning();
  return row;
}

async function userError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SavingsUserError);
  return (error as Error).message;
}

const holdingOf = async (id: number) => (await getDb().select().from(savingsHoldings).where(eq(savingsHoldings.id, id)))[0];
const transactions = () => getDb().select().from(savingsTransactions).orderBy(asc(savingsTransactions.id));

/** 假的股價清單 代號在這裡面就找得到 */
function lookupOf(quotes: Quote[], complete = true) {
  return vi.fn<QuoteLookup>(async (symbol) => {
    const quote = quotes.find((candidate) => candidate.symbol === symbol);
    return quote ? { quote } : { quote: null, complete };
  });
}
const QUOTES: Quote[] = [
  { symbol: "006208", name: "富邦台50", closeCents: 25_870, date: "2026-10-14", market: "twse" },
  { symbol: "00679B", name: "元大美債20年", closeCents: 2505, date: "2026-10-14", market: "tpex" },
];

async function setup() {
  const bank = await insertAccount({ name: "台銀" });
  const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
  const etf = await insertHolding({ accountId: broker.id });
  return { bank, broker, etf };
}

const buy = (holdingId: number, fromAccountId: number, values: Partial<BuyFields> = {}): BuyFields => ({ holdingId: String(holdingId), fromAccountId: String(fromAccountId), shares: "19", amount: "4,916", date: "2026-10-05", note: "", ...values });
const sell = (holdingId: number, toAccountId: number, values: Partial<SellFields> = {}): SellFields => ({ holdingId: String(holdingId), toAccountId: String(toAccountId), shares: "5", amount: "1,300", date: "2026-10-14", note: "", ...values });

describe("addHolding（新增持股：照券商 App 的庫存頁填目前股數與總成本）", () => {
  it("名稱從股價清單抄、代號轉大寫、排在這個帳戶的最後面", async () => {
    const { broker } = await setup();

    const holding = await addHolding(me, { accountId: String(broker.id), symbol: " 00679b ", shares: "100", cost: "2,600" }, lookupOf(QUOTES));

    expect(holding).toMatchObject({ userId: me, accountId: broker.id, symbol: "00679B", name: "元大美債20年", shares: 100, cost: 2600, sortOrder: 1 });
    expect((await listHoldings(me)).map((h) => h.symbol)).toEqual(["006208", "00679B"]);
  });

  it("清單裡沒有這個代號_找不到這個代號；清單讀不到_暫時讀不到股價清單；都不寫入", async () => {
    const { broker } = await setup();
    const fields = { accountId: String(broker.id), symbol: "9999", shares: "1", cost: "1" };

    expect(await userError(addHolding(me, fields, lookupOf(QUOTES)))).toBe("找不到這個代號：只支援台股上市櫃股票與 ETF");
    expect(await userError(addHolding(me, fields, lookupOf(QUOTES, false)))).toBe("暫時讀不到股價清單，請稍後再試");
    expect(await listHoldings(me)).toHaveLength(1);
  });

  it("同一個帳戶同一個代號只能一筆；別的投資帳戶可以", async () => {
    const { broker } = await setup();
    const another = await insertAccount({ name: "元大證券", kind: "investment" });

    expect(await userError(addHolding(me, { accountId: String(broker.id), symbol: "006208", shares: "1", cost: "1" }, lookupOf(QUOTES)))).toBe("這個帳戶已經有 006208 了，要改股數請修改那一檔");
    expect(await addHolding(me, { accountId: String(another.id), symbol: "006208", shares: "1", cost: "1" }, lookupOf(QUOTES))).toMatchObject({ accountId: another.id, sortOrder: 0 });
  });

  it("只能放在自己的、啟用中的投資帳戶；別人的帳戶當作找不到，也不去查股價", async () => {
    const { bank } = await setup();
    const closed = await insertAccount({ name: "舊證券", kind: "investment", active: false });
    const theirs = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const lookup = lookupOf(QUOTES);

    expect(await userError(addHolding(me, { accountId: String(bank.id), symbol: "006208", shares: "1", cost: "1" }, lookup))).toBe("持股要放在投資帳戶");
    expect(await userError(addHolding(me, { accountId: String(closed.id), symbol: "006208", shares: "1", cost: "1" }, lookup))).toBe("這個帳戶已停用，請先恢復");
    expect(await userError(addHolding(me, { accountId: String(theirs.id), symbol: "006208", shares: "1", cost: "1" }, lookup))).toBe(ACCOUNT_NOT_FOUND);
    expect(lookup).not.toHaveBeenCalled();
    expect(await getDb().select().from(savingsHoldings).where(eq(savingsHoldings.userId, other))).toEqual([]);
  });
});

describe("updateHolding 與 deleteHolding", () => {
  it("修改直接改股數與總成本（對帳用），不產生紀錄", async () => {
    const { etf } = await setup();

    expect(await updateHolding(me, etf.id, { shares: "132", cost: "30,700" })).toMatchObject({ shares: 132, cost: 30_700 });
    expect(await transactions()).toEqual([]);
  });

  it("刪除持股_定期定額跟著刪，買賣紀錄留著（holding_id 改成 null）_回傳代號與名稱", async () => {
    const { bank, broker, etf } = await setup();
    const [rule] = await getDb()
      .insert(savingsRecurring)
      .values({ userId: me, kind: "transfer", accountId: bank.id, counterAccountId: broker.id, holdingId: etf.id, amount: 5000, dayOfMonth: 5, mode: "confirm" })
      .returning();
    await buyHolding(me, buy(etf.id, bank.id), NOW);

    expect(await deleteHolding(me, etf.id)).toBe("006208 富邦台50");

    expect(await getDb().select().from(savingsRecurring).where(eq(savingsRecurring.id, rule.id))).toEqual([]);
    expect((await transactions()).map((t) => [t.amount, t.holdingId, t.shares])).toEqual([[4916, null, 19]]);
  });

  it("投資帳戶停用了_不能修改持股（跟新增、買進、賣出一樣），資料不變", async () => {
    const { broker, etf } = await setup();
    await getDb().update(savingsAccounts).set({ active: false }).where(eq(savingsAccounts.id, broker.id));

    expect(await userError(updateHolding(me, etf.id, { shares: "132", cost: "30,700" }))).toBe("這個帳戶已停用，請先恢復");
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 12, cost: 3000 });
  });

  it("別人的持股：修改當作找不到、刪除回 null，都不變", async () => {
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id });

    expect(await userError(updateHolding(me, theirs.id, { shares: "1", cost: "1" }))).toBe(HOLDING_NOT_FOUND);
    expect(await deleteHolding(me, theirs.id)).toBeNull();
    expect(await holdingOf(theirs.id)).toMatchObject({ shares: 12, cost: 3000 });
  });
});

describe("buyHolding（買進）", () => {
  it("寫一筆存款轉到投資帳戶的轉帳（股數、成本變動），持股加上股數與實際扣款；備註沒填是「買進 006208 19 股」", async () => {
    const { bank, broker, etf } = await setup();

    const { transaction, holding } = await buyHolding(me, buy(etf.id, bank.id), NOW);

    expect(transaction).toMatchObject({ userId: me, kind: "transfer", accountId: bank.id, counterAccountId: broker.id, amount: 4916, date: "2026-10-05", holdingId: etf.id, shares: 19, costChange: 4916, note: "買進 006208 19 股" });
    expect(holding).toMatchObject({ shares: 31, cost: 7916 });
  });

  it("錢要從存款帳戶出；帳戶停用、日期早於開始記帳或在未來都不行；都不寫入", async () => {
    const { etf } = await setup();
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const late = await insertAccount({ name: "新帳戶", createdAt: new Date("2026-10-10T04:00:00Z") });

    expect(await userError(buyHolding(me, buy(etf.id, card.id), NOW))).toBe("買進賣出的錢要從存款帳戶轉，請選存款帳戶");
    expect(await userError(buyHolding(me, buy(etf.id, closed.id), NOW))).toBe("這個帳戶已停用，請先恢復");
    expect(await userError(buyHolding(me, buy(etf.id, late.id), NOW))).toBe("「新帳戶」從 10 月 10 日開始記帳，日期不能更早");
    expect(await userError(buyHolding(me, buy(etf.id, late.id, { date: "2026-10-16" }), NOW))).toBe("不能記錄未來的日期");
    expect(await transactions()).toEqual([]);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 12, cost: 3000 });
  });

  it("總成本會超過 1 億_擋下", async () => {
    const { bank, broker } = await setup();
    const big = await insertHolding({ accountId: broker.id, symbol: "2330", name: "台積電", shares: 40_000, cost: 99_999_000 });

    expect(await userError(buyHolding(me, buy(big.id, bank.id, { amount: "1,001" }), NOW))).toBe("持股的總成本不能超過 1 億元");
  });

  it("別人的持股、或用別人的帳戶扣款_當作找不到，什麼都不寫", async () => {
    const { bank, etf } = await setup();
    const theirBank = await insertAccount({ name: "別人的台銀", userId: other });
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id });

    expect(await userError(buyHolding(me, buy(theirs.id, bank.id), NOW))).toBe(HOLDING_NOT_FOUND);
    expect(await userError(buyHolding(me, buy(etf.id, theirBank.id), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await transactions()).toEqual([]);
    expect(await holdingOf(theirs.id)).toMatchObject({ shares: 12, cost: 3000 });
  });

  it("先鎖使用者、再鎖帳戶（for share）、最後鎖持股（for update），然後才寫紀錄與改持股", async () => {
    const { bank, etf } = await setup();
    const statements = logStatements();

    await buyHolding(me, buy(etf.id, bank.id), NOW);

    const at = (pattern: RegExp) => statements.findIndex((sql) => pattern.test(sql));
    const order = [
      at(/^begin$/),
      at(/from "core_users" where .* for key share$/i),
      at(/from "savings_accounts" where .* for share$/i),
      at(/from "savings_holdings" where .* for update$/i),
      at(/^insert into "savings_transactions"/i),
      at(/^update "savings_holdings"/i),
    ];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("sellHolding（賣出：移除的成本照平均成本）", () => {
  it("12 股成本 3,000 賣 5 股入帳 1,300_移除成本 1,250，剩 7 股 1,750；紀錄是投資轉到存款，股數 -5、成本變動 -1,250", async () => {
    const { bank, broker, etf } = await setup();

    const { transaction, holding } = await sellHolding(me, sell(etf.id, bank.id), NOW);

    expect(transaction).toMatchObject({ kind: "transfer", accountId: broker.id, counterAccountId: bank.id, amount: 1300, shares: -5, costChange: -1250, note: "賣出 006208 5 股" });
    expect(holding).toMatchObject({ shares: 7, cost: 1750 });
  });

  it("全部賣完_成本歸零", async () => {
    const { bank, etf } = await setup();

    expect((await sellHolding(me, sell(etf.id, bank.id, { shares: "12", amount: "3,104" }), NOW)).holding).toMatchObject({ shares: 0, cost: 0 });
  });

  it("賣得比持有的多_擋下，什麼都不寫", async () => {
    const { bank, etf } = await setup();

    expect(await userError(sellHolding(me, sell(etf.id, bank.id, { shares: "13" }), NOW))).toBe("目前只有 12 股，不能賣更多");
    expect(await transactions()).toEqual([]);
  });

  it("賣別人的持股_當作找不到", async () => {
    const { bank } = await setup();
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id });

    expect(await userError(sellHolding(me, sell(theirs.id, bank.id), NOW))).toBe(HOLDING_NOT_FOUND);
    expect(await holdingOf(theirs.id)).toMatchObject({ shares: 12 });
  });

  it("賣出的錢入帳到別人的帳戶_當作找不到，什麼都不寫、持股不變", async () => {
    const { etf } = await setup();
    const theirBank = await insertAccount({ name: "別人的台銀", userId: other });

    expect(await userError(sellHolding(me, sell(etf.id, theirBank.id), NOW))).toBe(ACCOUNT_NOT_FOUND);
    expect(await transactions()).toEqual([]);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 12, cost: 3000 });
  });
});

describe("刪除與修改買賣紀錄", () => {
  it("刪除買進_持股扣回股數與成本；刪除賣出_持股加回賣掉的股數與移除的成本", async () => {
    const { bank, etf } = await setup();
    const bought = await buyHolding(me, buy(etf.id, bank.id), NOW);
    const sold = await sellHolding(me, sell(etf.id, bank.id), NOW);
    // 買進後 31 股 7,916 賣 5 股照平均成本移除 7,916 乘 5 除以 31 四捨五入是 1,277 剩 26 股 6,639
    expect(sold.holding).toMatchObject({ shares: 26, cost: 6639 });

    expect(await deleteTransaction(me, sold.transaction.id)).toBe(true);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 31, cost: 7916 });
    expect(await deleteTransaction(me, bought.transaction.id)).toBe(true);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 12, cost: 3000 });
  });

  it("同時按兩次刪除_只扣回一次", async () => {
    const { bank, etf } = await setup();
    const { transaction } = await buyHolding(me, buy(etf.id, bank.id), NOW);

    const results = await Promise.all([deleteTransaction(me, transaction.id), deleteTransaction(me, transaction.id)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 12, cost: 3000 });
  });

  it("之後改過持股讓扣回後變成負的_夾在 0；持股已經刪掉_只刪紀錄", async () => {
    const { bank, broker, etf } = await setup();
    const { transaction } = await buyHolding(me, buy(etf.id, bank.id), NOW);
    await updateHolding(me, etf.id, { shares: "10", cost: "2,000" });

    await deleteTransaction(me, transaction.id);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 0, cost: 0 });

    const tw50 = await insertHolding({ accountId: broker.id, symbol: "0050", name: "元大台灣50" });
    const second = await buyHolding(me, buy(tw50.id, bank.id), NOW);
    await deleteHolding(me, tw50.id);
    expect(await deleteTransaction(me, second.transaction.id)).toBe(true);
    expect(await transactions()).toEqual([]);
  });

  it("刪除別人的買賣紀錄_回 false，他的持股不變", async () => {
    const theirBank = await insertAccount({ name: "別人的台銀", userId: other });
    const theirBroker = await insertAccount({ name: "別人的證券", kind: "investment", userId: other });
    const theirs = await insertHolding({ userId: other, accountId: theirBroker.id });
    const { transaction } = await buyHolding(other, buy(theirs.id, theirBank.id), NOW);

    expect(await deleteTransaction(me, transaction.id)).toBe(false);
    expect(await holdingOf(theirs.id)).toMatchObject({ shares: 31 });
  });

  it("修改買賣紀錄只能改日期與備註（表單送回原本的帳戶與金額沒關係）；改金額、帳戶或類型_擋下", async () => {
    const { bank, broker, etf } = await setup();
    const { transaction } = await buyHolding(me, buy(etf.id, bank.id), NOW);
    const same = { kind: "transfer", accountId: String(bank.id), counterAccountId: String(broker.id), categoryId: "", amount: "4,916" };

    expect(await updateTransaction(me, transaction.id, { ...same, date: "2026-10-06", note: "10 月定期定額" }, NOW)).toMatchObject({ date: "2026-10-06", note: "10 月定期定額", amount: 4916, shares: 19 });
    expect(await updateTransaction(me, transaction.id, { kind: "", accountId: "", counterAccountId: "", categoryId: "", amount: "", date: "2026-10-07", note: "" }, NOW)).toMatchObject({ date: "2026-10-07", note: null });

    const blocked = "買賣紀錄只能改日期和備註，要改金額或股數請刪除後重記";
    expect(await userError(updateTransaction(me, transaction.id, { ...same, amount: "5000", date: "2026-10-06", note: "" }, NOW))).toBe(blocked);
    expect(await userError(updateTransaction(me, transaction.id, { ...same, accountId: String(broker.id), date: "2026-10-06", note: "" }, NOW))).toBe(blocked);
    expect(await userError(updateTransaction(me, transaction.id, { ...same, kind: "expense", date: "2026-10-06", note: "" }, NOW))).toBe(blocked);
    expect(await holdingOf(etf.id)).toMatchObject({ shares: 31, cost: 7916 });
  });
});

/** 取 setupTestDb 底下的 PGlite 記下送出的每一句 SQL 交易的開始記成 begin */
function logStatements(): string[] {
  const statements: string[] = [];
  const pglite = (testDb as TestDb & { $client: PGlite }).$client;
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    statements.push("begin");
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (sql) => statements.push(sql) } });
  return statements;
}
