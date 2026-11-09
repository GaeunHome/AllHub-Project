import { describe, expect, it } from "vitest";
import { allocate, balancesOf, minimalTransfers, parseExpense, parsePayers, parseRepayment, parseShares, personTotals, twdOf, type ExpenseLine } from "../expenses";

const YEN = { title: "晚餐", amount: "3000", currency: "JPY", rate: "0.2145", spentOn: "2026-11-20", category: "food" };

describe("parseExpense：金額與匯率", () => {
  it("金額換成分 匯率換成百萬分之一 不用浮點數", () => {
    expect(parseExpense(YEN)).toEqual({ ok: true, value: { title: "晚餐", amountCents: 300000, currency: "JPY", rateMicros: 214500, spentOn: "2026-11-20", category: "food" } });
  });

  it("台幣不用填匯率 填了也不算", () => {
    expect(parseExpense({ ...YEN, title: "計程車", amount: "1,250.5", currency: "TWD", rate: "9", category: "transport" })).toEqual({ ok: true, value: { title: "計程車", amountCents: 125050, currency: "TWD", rateMicros: 1000000, spentOn: "2026-11-20", category: "transport" } });
  });

  it.each([
    ["金額是 0", { amount: "0" }],
    ["金額是負的", { amount: "-5" }],
    ["金額超過兩位小數", { amount: "1.234" }],
    ["金額不是數字", { amount: "abc" }],
    ["金額超過上限", { amount: "20000001" }],
    ["外幣沒填匯率", { rate: "" }],
    ["匯率是 0", { rate: "0" }],
    ["匯率超過六位小數", { rate: "0.1234567" }],
    ["認不得的貨幣", { currency: "XXX" }],
    ["沒有項目名稱", { title: " " }],
    ["換算後超過一億台幣", { amount: "20000000", rate: "6" }],
    ["沒有日期", { spentOn: "" }],
    ["不存在的日期", { spentOn: "2026-02-30" }],
    ["認不得的類別", { category: "drinks" }],
  ])("%s：不收", (_name, change) => {
    expect(parseExpense({ ...YEN, ...change }).ok).toBe(false);
  });
});

describe("twdOf：換算成台幣", () => {
  it("四捨五入到元：3000 日圓 x 0.2145 = 643.5", () => {
    expect(twdOf(300000, 214500)).toBe(644);
  });

  it("台幣換算後不變", () => {
    expect(twdOf(125000, 1000000)).toBe(1250);
  });

  it("上限的金額乘上限的匯率也算得準", () => {
    expect(twdOf(2_000_000_000, 2_000_000_000)).toBe(40_000_000_000);
  });
});

const weights = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("allocate：照比例分台幣", () => {
  it("一樣的比例（平分）：除不盡的零頭照 id 順序一人多一元，跟以前的平分一樣", () => {
    expect(Object.fromEntries(allocate(1000, weights({ c: 1, a: 1, b: 1 })))).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.fromEntries(allocate(1001, weights({ c: 1, a: 1, b: 1 })))).toEqual({ a: 334, b: 334, c: 333 });
  });

  it("2:1:1 分 1001 元：500.5、250.25、250.25 先取整數，剩下的 1 元給小數最大的 a", () => {
    expect(Object.fromEntries(allocate(1001, weights({ a: 2, b: 1, c: 1 })))).toEqual({ a: 501, b: 250, c: 250 });
  });

  it("照金額：5000、4000、3000 日圓的份，換算的 2520 元照同樣的比例分，合計不變", () => {
    const parts = allocate(2520, weights({ a: 500000, b: 400000, c: 300000 }));
    expect(Object.fromEntries(parts)).toEqual({ a: 1050, b: 840, c: 630 });
  });

  it("上限的金額當比例也算得準（超過 Number 的精確範圍要用 BigInt）", () => {
    expect([...allocate(100_000_000, weights({ a: 2_000_000_000, b: 1 })).values()].reduce((sum, value) => sum + value, 0)).toBe(100_000_000);
  });
});

const line = (values: Partial<ExpenseLine> = {}): ExpenseLine => ({ payers: [{ userId: "a", amountCents: 90000 }], rateMicros: 1000000, shares: ["a", "b", "c"].map((userId) => ({ userId, weight: null })), ...values });

describe("balancesOf：每個人的帳", () => {
  it("付錢的人收回別人的份 自己的份不算", () => {
    expect(Object.fromEntries(balancesOf([line()], []))).toEqual({ a: 600, b: -300, c: -300 });
  });

  it("還過的錢不再算：結清與任意金額的還款一樣", () => {
    expect(Object.fromEntries(balancesOf([line()], [{ fromUser: "b", toUser: "a", amountTwd: 300 }]))).toEqual({ a: 300, b: 0, c: -300 });
    expect(Object.fromEntries(balancesOf([line()], [{ fromUser: "c", toUser: "a", amountTwd: 100 }]))).toEqual({ a: 500, b: -300, c: -200 });
  });

  it("沒有人分的帳不算 分的人都刪除帳號時會這樣", () => {
    expect(Object.fromEntries(balancesOf([line({ shares: [] })], []))).toEqual({});
  });

  it("兩個人付：住宿 $9,000 a 刷 6,000、b 刷 3,000，三人平分各 3,000", () => {
    const hotel = line({ payers: [{ userId: "a", amountCents: 600000 }, { userId: "b", amountCents: 300000 }] });
    expect(Object.fromEntries(balancesOf([hotel], []))).toEqual({ a: 3000, b: 0, c: -3000 });
  });

  it("照比例：$900 照 2:1 分給 a、c，a 自己付", () => {
    const meal = line({ shares: [{ userId: "a", weight: 2 }, { userId: "c", weight: 1 }] });
    expect(Object.fromEntries(balancesOf([meal], []))).toEqual({ a: 300, c: -300 });
  });

  it("付的人之一刪除帳號後（那一列不見）：只算還在的人付的，分的人照比例分，帳一樣平", () => {
    const hotel = line({ payers: [{ userId: "b", amountCents: 300000 }] });
    const balances = balancesOf([hotel], []);
    expect(Object.fromEntries(balances)).toEqual({ a: -1000, b: 2000, c: -1000 });
    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});

describe("personTotals：每個人付了、分攤與差額", () => {
  it("付了是自己刷的台幣，分攤是自己的份，差額扣掉已經還的錢", () => {
    const hotel = line({ payers: [{ userId: "a", amountCents: 600000 }, { userId: "b", amountCents: 300000 }] });
    const totals = personTotals([hotel, line()], [{ fromUser: "c", toUser: "a", amountTwd: 1000 }]);

    expect(totals.get("a")).toEqual({ paid: 6900, share: 3300, balance: 2600 });
    expect(totals.get("b")).toEqual({ paid: 3000, share: 3300, balance: -300 });
    expect(totals.get("c")).toEqual({ paid: 0, share: 3300, balance: -2300 });
  });
});

describe("minimalTransfers：誰給誰", () => {
  const transfers = (entries: Record<string, number>) => minimalTransfers(new Map(Object.entries(entries)));

  it("欠最多的先還給應收最多的 筆數最少", () => {
    expect(transfers({ a: 50, b: 30, c: -30, d: -50 })).toEqual([
      { from: "d", to: "a", amount: 50 },
      { from: "c", to: "b", amount: 30 },
    ]);
  });

  it("一個人欠兩個人 分成兩筆 金額合起來剛好", () => {
    expect(transfers({ a: 60, b: 40, c: -100 })).toEqual([
      { from: "c", to: "a", amount: 60 },
      { from: "c", to: "b", amount: 40 },
    ]);
  });

  it("都是 0：不用給", () => {
    expect(transfers({ a: 0, b: 0 })).toEqual([]);
  });
});

const PEOPLE = ["a", "b", "c"];

describe("parseShares：怎麼分", () => {
  it("平分：勾的人，至少一個", () => {
    expect(parseShares({ split: "even", checked: ["b", "a", "b"], portions: {} }, 90000)).toEqual({ ok: true, value: { split: "even", shares: [{ userId: "b", weight: null }, { userId: "a", weight: null }] } });
    expect(parseShares({ split: "even", checked: [], portions: {} }, 90000).ok).toBe(false);
  });

  it("照金額：沒填或填 0 的人不分，加起來要剛好等於這筆的金額", () => {
    const portions = { a: "500", b: "300.5", c: "0" };
    expect(parseShares({ split: "amount", checked: [], portions: { ...portions, c: "" } }, 80050)).toEqual({ ok: true, value: { split: "amount", shares: [{ userId: "a", weight: 50000 }, { userId: "b", weight: 30050 }] } });
    expect(parseShares({ split: "amount", checked: [], portions }, 90000)).toEqual({ ok: false, error: "每個人的金額加起來要等於 900，還差 99.5" });
    expect(parseShares({ split: "amount", checked: [], portions: { a: "1000" } }, 90000)).toEqual({ ok: false, error: "每個人的金額加起來要等於 900，多了 100" });
    expect(parseShares({ split: "amount", checked: [], portions: { a: "abc" } }, 90000).ok).toBe(false);
  });

  it("照比例：整數份數 0 到 99，0 的人不分", () => {
    expect(parseShares({ split: "ratio", checked: [], portions: { a: "2", b: "1", c: "0" } }, 90000)).toEqual({ ok: true, value: { split: "ratio", shares: [{ userId: "a", weight: 2 }, { userId: "b", weight: 1 }] } });
    expect(parseShares({ split: "ratio", checked: [], portions: { a: "1.5" } }, 90000).ok).toBe(false);
    expect(parseShares({ split: "ratio", checked: [], portions: { a: "100" } }, 90000).ok).toBe(false);
    expect(parseShares({ split: "ratio", checked: [], portions: { a: "0" } }, 90000).ok).toBe(false);
  });

  it("認不得的分法不收", () => {
    expect(parseShares({ split: "random", checked: PEOPLE, portions: {} }, 90000).ok).toBe(false);
  });
});

describe("parsePayers：誰付的", () => {
  it("一個人付：整筆都是他的", () => {
    expect(parsePayers({ many: false, paidBy: "a", amounts: {} }, 90000)).toEqual({ ok: true, value: [{ userId: "a", amountCents: 90000 }] });
    expect(parsePayers({ many: false, paidBy: "", amounts: {} }, 90000).ok).toBe(false);
  });

  it("好幾個人付：各自的金額加起來要剛好等於這筆，沒填的人不算", () => {
    expect(parsePayers({ many: true, paidBy: "", amounts: { a: "600", b: "300", c: "" } }, 90000)).toEqual({ ok: true, value: [{ userId: "a", amountCents: 60000 }, { userId: "b", amountCents: 30000 }] });
    expect(parsePayers({ many: true, paidBy: "", amounts: { a: "600" } }, 90000)).toEqual({ ok: false, error: "每個人付的加起來要等於 900，還差 300" });
    expect(parsePayers({ many: true, paidBy: "", amounts: {} }, 90000).ok).toBe(false);
  });
});

describe("parseRepayment：記還款", () => {
  it("台幣整數，給的人跟收的人不能是同一個", () => {
    expect(parseRepayment({ from: "b", to: "a", amount: "1,000" })).toEqual({ ok: true, value: { from: "b", to: "a", amountTwd: 1000 } });
    expect(parseRepayment({ from: "a", to: "a", amount: "1000" }).ok).toBe(false);
    expect(parseRepayment({ from: "b", to: "a", amount: "0" }).ok).toBe(false);
    expect(parseRepayment({ from: "b", to: "a", amount: "10.5" }).ok).toBe(false);
    expect(parseRepayment({ from: "", to: "a", amount: "10" }).ok).toBe(false);
  });
});
