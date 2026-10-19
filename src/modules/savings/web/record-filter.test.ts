import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_KEY } from "../lib/ledger";
import { NO_FILTERS, accountFilterFrom, categoryFilterFrom, filterRecords, groupByDate, hasFilters, recordTotals, type RecordItem } from "./record-filter";

let nextId = 1;
const record = (fields: Partial<RecordItem>): RecordItem => ({
  id: nextId++,
  kind: "expense",
  accountId: 1,
  accountName: "國泰",
  counterAccountId: null,
  counterAccountName: null,
  categoryId: 11,
  categoryName: "餐飲",
  amount: 100,
  date: "2026-10-14",
  note: null,
  recurring: false,
  recurringName: null,
  shares: null,
  holdingSymbol: null,
  cardBillId: null,
  backToPending: false,
  categoryIcon: null,
  ...fields,
});

const LUNCH = record({ amount: 120 });
const SALARY = record({ kind: "income", categoryId: 12, categoryName: "薪水", amount: 43000, date: "2026-10-05" });
const UNSORTED = record({ categoryId: null, categoryName: null, amount: 80, date: "2026-10-05" });
const TO_POST = record({ kind: "transfer", counterAccountId: 2, counterAccountName: "郵局", categoryId: null, categoryName: null, amount: 2500, date: "2026-10-03" });
const ADJUST = record({ kind: "adjust", accountId: 2, accountName: "郵局", categoryId: null, categoryName: null, amount: -350, date: "2026-10-03" });
const ALL = [LUNCH, SALARY, UNSORTED, TO_POST, ADJUST];

describe("filterRecords：紀錄頁在瀏覽器裡篩選這個月的紀錄", () => {
  it("沒有篩選_全部照原本的順序", () => {
    expect(filterRecords(ALL, NO_FILTERS)).toEqual(ALL);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it("依帳戶_轉帳的轉出與轉入兩邊都算", () => {
    expect(filterRecords(ALL, { ...NO_FILTERS, account: "2" })).toEqual([TO_POST, ADJUST]);
    expect(filterRecords(ALL, { ...NO_FILTERS, account: "1" })).toEqual([LUNCH, SALARY, UNSORTED, TO_POST]);
  });

  it("依分類", () => {
    expect(filterRecords(ALL, { ...NO_FILTERS, category: "12" })).toEqual([SALARY]);
  });

  it("未分類_只算沒有分類的收入與支出，轉帳和調整本來就沒有分類，不算進來", () => {
    expect(filterRecords(ALL, { ...NO_FILTERS, category: UNCATEGORIZED_KEY })).toEqual([UNSORTED]);
  });

  it("依類型", () => {
    expect(filterRecords(ALL, { ...NO_FILTERS, kind: "transfer" })).toEqual([TO_POST]);
    expect(filterRecords(ALL, { ...NO_FILTERS, kind: "adjust" })).toEqual([ADJUST]);
  });

  it("條件可以疊加", () => {
    const filters = { account: "1", category: "", kind: "expense" };

    expect(filterRecords(ALL, filters)).toEqual([LUNCH, UNSORTED]);
    expect(hasFilters(filters)).toBe(true);
  });

  it("選的帳戶或分類已經不在了（例如剛刪掉）_篩不到任何紀錄，不會整個失效變成全部", () => {
    expect(filterRecords(ALL, { ...NO_FILTERS, account: "99" })).toEqual([]);
  });
});

describe("categoryFilterFrom：網址的 ?category=（總覽點支出圓餅圖的一片連過來）", () => {
  const CATEGORIES = [{ id: 11 }, { id: 12 }];

  it("自己的分類 id_篩選那個分類", () => {
    expect(categoryFilterFrom("12", CATEGORIES)).toBe("12");
  });

  it("uncategorized_篩選未分類", () => {
    expect(categoryFilterFrom(UNCATEGORIZED_KEY, CATEGORIES)).toBe(UNCATEGORIZED_KEY);
  });

  it.each([undefined, "", "99", "abc", "012", "1.5", "none"])("%j（沒給、不是自己的分類或認不得）_不篩選", (raw) => {
    expect(categoryFilterFrom(raw, CATEGORIES)).toBe("");
  });

  it("同一個參數出現好幾次（陣列）_不篩選", () => {
    expect(categoryFilterFrom(["11", "12"], CATEGORIES)).toBe("");
  });
});

describe("accountFilterFrom：網址的 ?account=（帳戶頁的卡片連過來）", () => {
  const ACCOUNTS = [{ id: 1 }, { id: 2 }];

  it("自己的帳戶 id_篩選那個帳戶", () => {
    expect(accountFilterFrom("2", ACCOUNTS)).toBe("2");
  });

  it.each([undefined, "", "99", "abc", "1.5", ["1", "2"]])("%j（沒給、不是自己的帳戶或認不得）_不篩選", (raw) => {
    expect(accountFilterFrom(raw, ACCOUNTS)).toBe("");
  });
});

describe("groupByDate：依日期分組，新的在前", () => {
  it("同一天的放在一組，保留伺服器排好的順序", () => {
    expect(groupByDate(ALL)).toEqual([
      { date: "2026-10-14", records: [LUNCH] },
      { date: "2026-10-05", records: [SALARY, UNSORTED] },
      { date: "2026-10-03", records: [TO_POST, ADJUST] },
    ]);
  });

  it("沒有紀錄_沒有任何一組", () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe("recordTotals：列出來的紀錄的收入與支出", () => {
  it("只算收入與支出，轉帳與調整不算", () => {
    expect(recordTotals(ALL)).toEqual({ income: 43000, expense: 200 });
  });

  it("篩選後只算看得到的", () => {
    expect(recordTotals(filterRecords(ALL, { ...NO_FILTERS, category: "11" }))).toEqual({ income: 0, expense: 120 });
  });
});
