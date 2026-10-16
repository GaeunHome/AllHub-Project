import { cacheLife } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { captureErrorLog, tagged } from "@/dev/test-helpers";
import { savingsAccounts, savingsCardBills, savingsCategories, savingsHoldings, savingsPurposes, savingsRecurring, savingsTransactions } from "../data/schema";
import {
  cachedAccountFlows,
  cachedAccounts,
  cachedCardBills,
  cachedCardFlows,
  cachedCategories,
  cachedCategoryTotals,
  cachedHoldings,
  cachedMonthTransactions,
  cachedPurposes,
  cachedQuotes,
  cachedRecurring,
} from "./cached";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
  const [purpose] = await testDb.insert(savingsPurposes).values({ userId: me, name: "生活費", color: "blue" }).returning();
  const [category] = await testDb.insert(savingsCategories).values({ userId: me, kind: "expense", name: "訂閱", color: "violet" }).returning();
  const [account] = await testDb.insert(savingsAccounts).values({ userId: me, name: "國泰", kind: "deposit", purposeId: purpose.id }).returning();
  const [rule] = await testDb.insert(savingsRecurring).values({ userId: me, kind: "expense", accountId: account.id, categoryId: category.id, amount: 390, dayOfMonth: 6, name: "Netflix" }).returning();
  await testDb.insert(savingsTransactions).values([
    { userId: me, kind: "expense", accountId: account.id, categoryId: category.id, amount: 390, date: "2026-10-06", recurringId: rule.id },
    { userId: me, kind: "income", accountId: account.id, amount: 43_000, date: "2026-09-05" },
  ]);
});

/** 信用卡與持股的資料 只有用到的測試才加 其他測試的結果才不會跟著變 */
async function addCardAndHolding() {
  const [account] = await testDb.select().from(savingsAccounts);
  const [card] = await testDb.insert(savingsAccounts).values({ userId: me, name: "國泰卡", kind: "credit", statementDay: 5, dueDay: 20 }).returning();
  const [broker] = await testDb.insert(savingsAccounts).values({ userId: me, name: "臺銀證券", kind: "investment" }).returning();
  const [etf] = await testDb.insert(savingsHoldings).values({ userId: me, accountId: broker.id, symbol: "006208", name: "富邦台50", shares: 19, cost: 4916 }).returning();
  await testDb.insert(savingsTransactions).values([
    { userId: me, kind: "expense", accountId: card.id, amount: 820, date: "2026-10-07" },
    { userId: me, kind: "transfer", accountId: account.id, counterAccountId: card.id, amount: 500, date: "2026-10-08" },
    { userId: me, kind: "expense", accountId: card.id, amount: 300, date: "2026-07-01" },
    { userId: me, kind: "transfer", accountId: account.id, counterAccountId: broker.id, amount: 4916, date: "2026-10-05", holdingId: etf.id, shares: 19, costChange: 4916 },
  ]);
  await testDb.insert(savingsCardBills).values({ userId: me, accountId: card.id, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 1120 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("理財的快取讀取：標上讀到的資料表、用 db 效期", () => {
  it("cachedAccounts_savings:accounts", async () => {
    expect((await cachedAccounts(me)).map((a) => a.name)).toEqual(["國泰"]);
    expect(tagged()).toEqual(["savings:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedPurposes_savings:purposes", async () => {
    expect((await cachedPurposes(me)).map((p) => p.name)).toEqual(["生活費"]);
    expect(tagged()).toEqual(["savings:purposes"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCategories_savings:categories", async () => {
    expect((await cachedCategories(me)).map((c) => c.name)).toEqual(["訂閱"]);
    expect(tagged()).toEqual(["savings:categories"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecurring_savings:recurring", async () => {
    expect((await cachedRecurring(me)).map((r) => r.amount)).toEqual([390]);
    expect(tagged()).toEqual(["savings:recurring"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedAccountFlows_所有紀錄的彙總：savings:transactions", async () => {
    expect((await cachedAccountFlows(me)).map((f) => [f.month, f.income, f.expense])).toEqual([
      ["2026-09", 43_000, 0],
      ["2026-10", 0, 390],
    ]);
    expect(tagged()).toEqual(["savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCategoryTotals_所有紀錄的彙總：savings:transactions", async () => {
    expect((await cachedCategoryTotals(me)).map((t) => [t.month, t.kind, t.amount])).toEqual([
      ["2026-09", "income", 43_000],
      ["2026-10", "expense", 390],
    ]);
    expect(tagged()).toEqual(["savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedMonthTransactions_單一月份，名稱與代號是查詢時 join 的：帳戶、分類、持股、固定收支改名或刪除也要重讀", async () => {
    await addCardAndHolding();
    expect((await cachedMonthTransactions(me, "2026-10")).map((t) => [t.accountName, t.categoryName, t.amount, t.recurring, t.recurringName, t.holdingSymbol, t.shares])).toEqual([
      ["國泰", null, 500, false, null, null, null],
      ["國泰卡", null, 820, false, null, null, null],
      ["國泰", "訂閱", 390, true, "Netflix", null, null],
      ["國泰", null, 4916, false, null, "006208", 19],
    ]);
    expect(tagged()).toEqual(["savings:accounts", "savings:categories", "savings:holdings", "savings:recurring", "savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedHoldings_savings:holdings", async () => {
    await addCardAndHolding();
    expect((await cachedHoldings(me)).map((h) => [h.symbol, h.shares, h.cost])).toEqual([["006208", 19, 4916]]);
    expect(tagged()).toEqual(["savings:holdings"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCardFlows_只有信用卡、since 當天以後的每日流量（轉入算在信用卡上）：查詢時 join 帳戶看是不是信用卡，所以也標 savings:accounts", async () => {
    await addCardAndHolding();
    expect(await cachedCardFlows(me, "2026-08-06")).toEqual([
      { accountId: expect.any(Number), date: "2026-10-07", income: 0, expense: 820, transferIn: 0, transferOut: 0, adjust: 0 },
      { accountId: expect.any(Number), date: "2026-10-08", income: 0, expense: 0, transferIn: 500, transferOut: 0, adjust: 0 },
    ]);
    expect(tagged()).toEqual(["savings:accounts", "savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedCardBills_帳單與它繳了多少（看結帳後轉進卡的錢）：savings:bills，繳款是紀錄、結帳日的算法看卡的設定，也標 transactions 與 accounts", async () => {
    await addCardAndHolding();
    expect((await cachedCardBills(me)).map((b) => [b.statementDate, b.amount, b.paid, b.lastPaidOn])).toEqual([["2026-10-05", 1120, 500, "2026-10-08"]]);
    expect(tagged()).toEqual(["savings:accounts", "savings:bills", "savings:transactions"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });
});

// 證交所與櫃買的回應形狀照真實的 只留用得到的欄位
// 真的清單有上千筆 不到 100 筆會當成讀不到 所以補上別的股票
const TWSE = [
  { Date: "1151014", Code: "006208", Name: "富邦台50", ClosingPrice: "258.70" },
  { Date: "1151014", Code: "0050", Name: "元大台灣50", ClosingPrice: "113.00" },
  ...Array.from({ length: 100 }, (_, i) => ({ Date: "1151014", Code: String(1101 + i), Name: `上市股票${i}`, ClosingPrice: "10.00" })),
];
const TPEX = [
  { Date: "1151014", SecuritiesCompanyCode: "00679B", CompanyName: "元大美債20年", Close: "25.05" },
  ...Array.from({ length: 100 }, (_, i) => ({ Date: "1151014", SecuritiesCompanyCode: String(3201 + i), CompanyName: `上櫃股票${i}`, Close: "20.00" })),
];

describe("cachedQuotes（股價：不存資料庫，savings:external）", () => {
  const answer = (twse: unknown, tpex: unknown) =>
    fakeFetch(({ url }) => {
      if (url.includes("STOCK_DAY_ALL")) return twse instanceof Error ? Promise.reject(twse) : Response.json(twse);
      if (url.includes("tpex_mainboard_quotes")) return tpex instanceof Error ? Promise.reject(tpex) : Response.json(tpex);
      throw new Error(`沒有預期的網址 ${url}`);
    });

  it("只回傳要的代號（不分大小寫、重複的只算一次）_兩個清單都讀到時用 quotes 效期（一小時看一次）", async () => {
    vi.stubGlobal("fetch", answer(TWSE, TPEX).impl);

    expect((await cachedQuotes(["006208", "00679b", "006208"]))?.map((q) => [q.symbol, q.closeCents, q.market])).toEqual([
      ["006208", 25_870, "twse"],
      ["00679B", 2505, "tpex"],
    ]);
    expect(tagged()).toEqual(["savings:external"]);
    expect(cacheLife).toHaveBeenCalledWith("quotes");
  });

  it("只讀到一個清單_回傳讀到的，用短效期（external）幾分鐘後再試", async () => {
    captureErrorLog();
    vi.stubGlobal("fetch", answer(TWSE, new TypeError("fetch failed")).impl);

    expect((await cachedQuotes(["006208", "00679B"]))?.map((q) => q.symbol)).toEqual(["006208"]);
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(cacheLife).not.toHaveBeenCalledWith("quotes");
  });

  it("兩個都讀不到_null（畫面寫股價暫時讀不到），用短效期", async () => {
    captureErrorLog();
    vi.stubGlobal("fetch", answer(new TypeError("fetch failed"), new TypeError("fetch failed")).impl);

    expect(await cachedQuotes(["006208"])).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
  });

  it("沒有持股（沒有代號）_不對外連線", async () => {
    const fetch = answer(TWSE, TPEX);
    vi.stubGlobal("fetch", fetch.impl);

    expect(await cachedQuotes([])).toEqual([]);
    expect(fetch.impl).not.toHaveBeenCalled();
  });
});

describe("依使用者的快取：使用者 id 是參數，別人讀到的是自己的那一份", () => {
  it("每個快取函式換成別人都是空的", async () => {
    await addCardAndHolding();
    expect(await cachedAccounts(other)).toEqual([]);
    expect(await cachedPurposes(other)).toEqual([]);
    expect(await cachedCategories(other)).toEqual([]);
    expect(await cachedRecurring(other)).toEqual([]);
    expect(await cachedAccountFlows(other)).toEqual([]);
    expect(await cachedCategoryTotals(other)).toEqual([]);
    expect(await cachedMonthTransactions(other, "2026-10")).toEqual([]);
    expect(await cachedHoldings(other)).toEqual([]);
    expect(await cachedCardFlows(other, "2026-01-01")).toEqual([]);
    expect(await cachedCardBills(other)).toEqual([]);
  });
});
