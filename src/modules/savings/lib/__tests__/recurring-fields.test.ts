import { describe, expect, it } from "vitest";
import { parseConfirmFields, parseOccurrenceFields, parseRecurringFields } from "../recurring-fields";
import { NOT_FOUND, parsePeriod } from "../validation";

const TODAY = "2026-10-14";

describe("parseRecurringFields（固定收支）", () => {
  const rule = (fields: Partial<Record<string, string>> = {}) => ({
    kind: "expense",
    accountId: "1",
    counterAccountId: "",
    categoryId: "",
    amount: "120",
    dayOfMonth: "6",
    note: "",
    name: "",
    intervalMonths: "",
    startMonth: "",
    holidayRule: "",
    mode: "",
    holdingId: "",
    allocate: "",
    subscription: "",
    ...fields,
  });

  it("支出才算訂閱：沒打勾是一般的固定收支，收入與轉帳直接 POST 也不會變成訂閱", () => {
    expect(parseRecurringFields(rule({ subscription: "on" }))).toMatchObject({ ok: true, value: { subscription: true } });
    expect(parseRecurringFields(rule())).toMatchObject({ ok: true, value: { subscription: false } });
    expect(parseRecurringFields(rule({ kind: "income", subscription: "on" }))).toMatchObject({ ok: true, value: { subscription: false } });
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "2", subscription: "on" }))).toMatchObject({ ok: true, value: { subscription: false } });
  });

  it("每月 6 日的支出_沒填的間隔、假日規則、記帳方式是每月、照原日、到期請我確認", () => {
    expect(parseRecurringFields(rule({ categoryId: "3", note: "Netflix" }))).toEqual({
      ok: true,
      value: {
        kind: "expense",
        accountId: 1,
        counterAccountId: null,
        categoryId: 3,
        amount: 120,
        dayOfMonth: 6,
        note: "Netflix",
        name: null,
        intervalMonths: 1,
        startMonth: null,
        holidayRule: "none",
        mode: "confirm",
        holdingId: null,
        allocate: false,
        subscription: false,
      },
    });
  });

  it("名稱、每 2 個月從 8 月開始（存 1 號）、遇假日延後、自動記帳", () => {
    expect(parseRecurringFields(rule({ name: " 電費 ", intervalMonths: "2", startMonth: "2026-08", holidayRule: "after", mode: "auto" }))).toMatchObject({
      ok: true,
      value: { name: "電費", intervalMonths: 2, startMonth: "2026-08-01", holidayRule: "after", mode: "auto" },
    });
  });

  it("每月一次時不看起始月份", () => {
    expect(parseRecurringFields(rule({ intervalMonths: "1", startMonth: "2026-12" }))).toMatchObject({ ok: true, value: { startMonth: null } });
  });

  it.each([
    [{ intervalMonths: "4" }, "多久一次"],
    [{ intervalMonths: "2", startMonth: "2026-13" }, "哪個月開始"],
    [{ holidayRule: "skip" }, "遇假日"],
    [{ mode: "manual" }, "記帳方式"],
    [{ name: "字".repeat(21) }, "20 個字"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseRecurringFields(rule(fields))).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("定期定額（regular 或帶 holdingId 的轉帳）_要選哪一檔，轉入帳戶先是 null（service 照那一檔填），分類忽略", () => {
    const expected = { ok: true, value: { kind: "transfer", accountId: 1, counterAccountId: null, categoryId: null, holdingId: 21, mode: "confirm" } };

    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "21", counterAccountId: "9", categoryId: "3", mode: "confirm" }))).toMatchObject(expected);
    expect(parseRecurringFields(rule({ kind: "transfer", holdingId: "21", counterAccountId: "9", mode: "confirm" }))).toMatchObject(expected);
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "" }))).toEqual({ ok: false, error: expect.stringContaining("哪一檔") });
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "abc" }))).toEqual({ ok: false, error: NOT_FOUND.holding });
  });

  it("定期定額要確認股數、薪水要確認實際金額_選自動記帳時擋下", () => {
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "21", mode: "auto" }))).toEqual({ ok: false, error: expect.stringMatching(/股數.*到期請我確認/) });
    expect(parseRecurringFields(rule({ kind: "income", allocate: "on", mode: "auto" }))).toEqual({ ok: false, error: expect.stringMatching(/實際金額.*到期請我確認/) });
  });

  it("「這是薪水」只有收入有效", () => {
    expect(parseRecurringFields(rule({ kind: "income", allocate: "on" }))).toMatchObject({ ok: true, value: { allocate: true } });
    expect(parseRecurringFields(rule({ kind: "expense", allocate: "on", mode: "auto" }))).toMatchObject({ ok: true, value: { allocate: false, mode: "auto" } });
  });

  it("每月轉帳（定期定額）", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "2" }))).toMatchObject({ ok: true, value: { kind: "transfer", counterAccountId: 2, categoryId: null } });
  });

  it.each(["0", "32", "", "6.5"])("日期 %j_要在 1 到 31 日之間", (dayOfMonth) => {
    expect(parseRecurringFields(rule({ dayOfMonth }))).toEqual({ ok: false, error: expect.stringContaining("1 到 31 日") });
  });

  it("轉入與轉出同一個帳戶_錯誤", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "1" }))).toEqual({ ok: false, error: expect.stringContaining("同一個帳戶") });
  });
});

describe("parseConfirmFields 與 parseOccurrenceFields（確認或略過待處理的一期）", () => {
  const confirm = (fields: Partial<Record<"ruleId" | "period" | "amount" | "date" | "note" | "shares", string>> = {}) => ({
    ruleId: "30",
    period: "2026-10",
    amount: "4,916",
    date: TODAY,
    note: "",
    shares: "",
    ...fields,
  });

  it("金額可以跟預計的不同；股數選填（只有定期定額要）", () => {
    expect(parseConfirmFields(confirm(), TODAY)).toEqual({ ok: true, value: { ruleId: 30, period: "2026-10", amount: 4916, date: TODAY, note: null, shares: null } });
    expect(parseConfirmFields(confirm({ shares: "19" }), TODAY)).toMatchObject({ ok: true, value: { shares: 19 } });
  });

  it.each([
    [{ ruleId: "0" }, NOT_FOUND.recurring],
    [{ period: "2026-13" }, "這一期"],
    [{ amount: "" }, "金額"],
    [{ date: "2026-10-20" }, "未來"],
    [{ shares: "0" }, "股數"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseConfirmFields(confirm(fields), TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("期別收 YYYY-MM，資料庫格式的 1 號也收", () => {
    expect(parseOccurrenceFields({ ruleId: "30", period: "2026-10-01" })).toEqual({ ok: true, value: { ruleId: 30, period: "2026-10" } });
    expect(parsePeriod("2026-10-15")).toBeNull();
  });
});
