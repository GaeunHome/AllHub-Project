import { describe, expect, it } from "vitest";
import { NOTE_MAX_LENGTH } from "../kinds";
import { parseBalanceFields, parseEntryFields } from "../entry-fields";
import { NOT_FOUND } from "../validation";

const TODAY = "2026-10-14";

const entry = (fields: Partial<Record<string, string>> = {}) => ({
  kind: "expense",
  accountId: "1",
  counterAccountId: "",
  categoryId: "",
  amount: "120",
  date: TODAY,
  note: "",
  ...fields,
});

describe("parseEntryFields（收入、支出、轉帳）", () => {
  it("支出_分類留空是未分類_備註留空是 null", () => {
    expect(parseEntryFields(entry(), TODAY)).toEqual({
      ok: true,
      value: { kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 120, date: TODAY, note: null },
    });
  });

  it("收入_帶分類與備註_轉入帳戶不適用而忽略", () => {
    expect(parseEntryFields(entry({ kind: "income", categoryId: "4", counterAccountId: "2", note: " 十月 " }), TODAY)).toEqual({
      ok: true,
      value: { kind: "income", accountId: 1, counterAccountId: null, categoryId: 4, amount: 120, date: TODAY, note: "十月" },
    });
  });

  it("轉帳_要有轉入帳戶_分類不適用而忽略", () => {
    expect(parseEntryFields(entry({ kind: "transfer", counterAccountId: "2", categoryId: "4" }), TODAY)).toEqual({
      ok: true,
      value: { kind: "transfer", accountId: 1, counterAccountId: 2, categoryId: null, amount: 120, date: TODAY, note: null },
    });
  });

  it.each(["adjust", "", "refund"])("類型 %j_不能自己選", (kind) => {
    expect(parseEntryFields(entry({ kind }), TODAY)).toEqual({ ok: false, error: "類型不正確" });
  });

  it("沒選帳戶_要求選帳戶", () => {
    expect(parseEntryFields(entry({ accountId: "" }), TODAY)).toEqual({ ok: false, error: "請選擇帳戶" });
  });

  it("帳戶 id 格式不對_當作找不到帳戶", () => {
    expect(parseEntryFields(entry({ accountId: "x" }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("轉帳沒選轉入帳戶_要求選轉入的帳戶", () => {
    expect(parseEntryFields(entry({ kind: "transfer" }), TODAY)).toEqual({ ok: false, error: "請選擇轉入的帳戶" });
  });

  it("轉帳的轉出與轉入是同一個帳戶_錯誤", () => {
    expect(parseEntryFields(entry({ kind: "transfer", counterAccountId: "1" }), TODAY)).toEqual({ ok: false, error: "轉出和轉入不能是同一個帳戶" });
  });

  it("分類 id 格式不對_當作找不到分類", () => {
    expect(parseEntryFields(entry({ categoryId: "1.5" }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.category });
  });

  it("金額、日期、備註不合法_回各自的錯誤", () => {
    expect(parseEntryFields(entry({ amount: "0" }), TODAY)).toEqual({ ok: false, error: "金額至少 1 元" });
    expect(parseEntryFields(entry({ date: "2026-10-15" }), TODAY)).toEqual({ ok: false, error: "不能記錄未來的日期" });
    expect(parseEntryFields(entry({ note: "字".repeat(NOTE_MAX_LENGTH + 1) }), TODAY)).toEqual({ ok: false, error: "備註最多 200 個字" });
  });
});

describe("parseBalanceFields（更新餘額）", () => {
  it("帳戶與實際金額_0 也可以", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "0" })).toEqual({ ok: true, value: { accountId: 5, actual: 0 } });
    expect(parseBalanceFields({ accountId: "5", actual: "52,300" })).toEqual({ ok: true, value: { accountId: 5, actual: 52_300 } });
  });

  it("沒填金額_要求輸入", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "" })).toEqual({ ok: false, error: expect.stringContaining("金額") });
  });

  it("帳戶 id 不對_當作找不到帳戶", () => {
    expect(parseBalanceFields({ accountId: "", actual: "1" })).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("存款餘額與投資市值不能是負數（信用卡沒有更新餘額）", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "-300" })).toEqual({ ok: false, error: expect.stringContaining("負數") });
  });
});
