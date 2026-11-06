import { describe, expect, it } from "vitest";
import { balancesOf, minimalTransfers, parseExpense, splitEvenly, twdOf } from "../expenses";

const YEN = { title: "晚餐", amount: "3000", currency: "JPY", rate: "0.2145" };

describe("parseExpense：金額與匯率", () => {
  it("金額換成分 匯率換成百萬分之一 不用浮點數", () => {
    expect(parseExpense(YEN)).toEqual({ ok: true, value: { title: "晚餐", amountCents: 300000, currency: "JPY", rateMicros: 214500 } });
  });

  it("台幣不用填匯率 填了也不算", () => {
    expect(parseExpense({ title: "計程車", amount: "1,250.5", currency: "TWD", rate: "9" })).toEqual({ ok: true, value: { title: "計程車", amountCents: 125050, currency: "TWD", rateMicros: 1000000 } });
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

describe("splitEvenly：平分", () => {
  it("除不盡的零頭 照 id 順序一人多一元 總和不變", () => {
    expect(Object.fromEntries(splitEvenly(1000, ["c", "a", "b"]))).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.fromEntries(splitEvenly(1001, ["c", "a", "b"]))).toEqual({ a: 334, b: 334, c: 333 });
  });

  it("送進來的順序不同 算出來一樣", () => {
    expect(splitEvenly(100, ["b", "a", "c"])).toEqual(splitEvenly(100, ["a", "c", "b"]));
  });
});

const dinner = { paidBy: "a", amountCents: 90000, rateMicros: 1000000, shares: ["a", "b", "c"] };

describe("balancesOf：每個人的帳", () => {
  it("付錢的人收回別人的份 自己的份不算", () => {
    expect(Object.fromEntries(balancesOf([dinner], []))).toEqual({ a: 600, b: -300, c: -300 });
  });

  it("結清過的不再算", () => {
    expect(Object.fromEntries(balancesOf([dinner], [{ fromUser: "b", toUser: "a", amountTwd: 300 }]))).toEqual({ a: 300, b: 0, c: -300 });
  });

  it("沒有人分的帳不算 分的人都刪除帳號時會這樣", () => {
    expect(Object.fromEntries(balancesOf([{ ...dinner, shares: [] }], []))).toEqual({});
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
