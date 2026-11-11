import { describe, expect, it } from "vitest";
import { checkBillDueDate, parseCardBillFields, parsePayCardFields } from "../card-fields";
import { NOT_FOUND } from "../validation";

const TODAY = "2026-10-14";

describe("parsePayCardFields（繳卡費）", () => {
  it("信用卡、扣款帳戶、金額、日期；帳單金額選填（一起填這一期的帳單，要一起填截止日）", () => {
    const bill = { billAmount: "12,480", dueDate: "2026-10-20" };

    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY }, TODAY)).toEqual({ ok: true, value: { cardId: 3, fromAccountId: 2, amount: 6340, date: TODAY, billAmount: null, dueDate: null, categoryId: null } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, categoryId: "11" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 12_480, dueDate: "2026-10-20", categoryId: 11 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, categoryId: "abc" }, TODAY)).toEqual({ ok: false, error: NOT_FOUND.category });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 12_480 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, billAmount: "0" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 0 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, billAmount: "-1" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("帳單金額") });
  });

  it("填了帳單金額卻沒填截止日或截止日不對_擋下；沒填帳單金額時不看截止日", () => {
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, billAmount: "12,480" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("截止日") });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, billAmount: "12,480", dueDate: "2026-02-30" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("截止日") });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, dueDate: "abc" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: null, dueDate: null } });
  });

  it.each([
    [{ cardId: "" }, NOT_FOUND.account],
    [{ fromAccountId: "" }, "扣款的帳戶"],
    [{ fromAccountId: "3" }, "同一個帳戶"],
    [{ amount: "0" }, "至少 1 元"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6340", date: TODAY, ...fields }, TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});

describe("parseCardBillFields（填帳單：金額與截止日照銀行的帳單）", () => {
  const fields = (values: Partial<Record<"cardId" | "amount" | "statementDate" | "dueDate" | "categoryId", string>> = {}) => ({ cardId: "3", amount: "12,480", statementDate: "", dueDate: "2026-10-25", categoryId: "", ...values });

  it("信用卡、帳單金額與截止日（照填的存，假日也一樣）；0 元也可以；結帳日與分類選填", () => {
    expect(parseCardBillFields(fields(), TODAY)).toEqual({ ok: true, value: { cardId: 3, amount: 12_480, statementDate: null, dueDate: "2026-10-25", categoryId: null } });
    expect(parseCardBillFields(fields({ amount: "0", statementDate: "2026-10-05", dueDate: "2026-11-02", categoryId: "11" }), TODAY)).toEqual({
      ok: true,
      value: { cardId: 3, amount: 0, statementDate: "2026-10-05", dueDate: "2026-11-02", categoryId: 11 },
    });
  });

  it.each([
    [{ cardId: "" }, NOT_FOUND.account],
    [{ amount: "" }, "帳單金額"],
    [{ amount: "-1" }, "帳單金額"],
    [{ statementDate: "2026-10-15" }, "未來"],
    [{ statementDate: "10/5" }, "結帳日"],
    [{ dueDate: "" }, "請輸入繳款截止日"],
    [{ dueDate: "2026-02-30" }, "繳款截止日"],
    [{ dueDate: "10/25" }, "繳款截止日"],
    [{ categoryId: "abc" }, NOT_FOUND.category],
  ])("%j_錯誤提到「%s」", (values, keyword) => {
    expect(parseCardBillFields(fields(values), TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});

describe("checkBillDueDate（截止日要在結帳日到結帳後 60 天之間）", () => {
  it.each([
    ["2026-10-05", "2026-10-05", "跟結帳日同一天"],
    ["2026-10-05", "2026-12-04", "結帳後第 60 天"],
    ["2026-12-31", "2027-03-01", "跨年 結帳後第 60 天"],
  ])("%s 結帳、截止 %s_可以（%s）", (statementDate, dueDate) => {
    expect(checkBillDueDate(statementDate, dueDate)).toEqual({ ok: true, value: dueDate });
  });

  it.each([
    ["2026-10-05", "2026-10-04", "早於結帳日"],
    ["2026-10-05", "2026-12-05", "結帳後第 61 天"],
    ["2026-12-31", "2027-03-02", "跨年 結帳後第 61 天"],
  ])("%s 結帳、截止 %s_擋下（%s）", (statementDate, dueDate) => {
    expect(checkBillDueDate(statementDate, dueDate)).toEqual({ ok: false, error: expect.stringContaining("繳款截止日") });
  });
});
