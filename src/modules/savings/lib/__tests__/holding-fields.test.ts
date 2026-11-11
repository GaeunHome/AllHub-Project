import { describe, expect, it } from "vitest";
import { parseHoldingFields, parseHoldingUpdateFields, parseTradeFields } from "../holding-fields";
import { NOT_FOUND } from "../validation";

const TODAY = "2026-10-14";

describe("parseHoldingFields 與 parseHoldingUpdateFields（持股：照券商 App 的庫存頁）", () => {
  const holding = (fields: Partial<Record<"accountId" | "symbol" | "shares" | "cost", string>> = {}) => ({ accountId: "7", symbol: " 006208 ", shares: "120", cost: "27,600", ...fields });

  it("代號正規化、股數與總成本", () => {
    expect(parseHoldingFields(holding({ symbol: "00679b" }))).toEqual({ ok: true, value: { accountId: 7, symbol: "00679B", shares: 120, cost: 27_600 } });
  });

  it("股數與成本都可以是 0", () => {
    expect(parseHoldingFields(holding({ shares: "0", cost: "0" }))).toMatchObject({ ok: true, value: { shares: 0, cost: 0 } });
  });

  it.each([
    [{ accountId: "" }, "投資帳戶"],
    [{ accountId: "x" }, NOT_FOUND.account],
    [{ symbol: " " }, "代號"],
    [{ symbol: "2330.TW" }, "找不到這個代號"],
    [{ shares: "1.5" }, "目前股數"],
    [{ cost: "-1" }, "總成本"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseHoldingFields(holding(fields))).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("修改只收股數與總成本", () => {
    expect(parseHoldingUpdateFields({ shares: "132", cost: "30,700" })).toEqual({ ok: true, value: { shares: 132, cost: 30_700 } });
  });
});

describe("parseTradeFields（買進與賣出）", () => {
  const trade = (fields: Partial<Record<"holdingId" | "accountId" | "shares" | "amount" | "date" | "note", string>> = {}) => ({
    holdingId: "21",
    accountId: "1",
    shares: "12",
    amount: "3,105",
    date: TODAY,
    note: "",
    ...fields,
  });

  it("持股、存款帳戶、股數、實際扣款或入帳（含手續費）、日期、備註", () => {
    expect(parseTradeFields(trade(), "buy", TODAY)).toEqual({ ok: true, value: { holdingId: 21, accountId: 1, shares: 12, amount: 3105, date: TODAY, note: null } });
  });

  it.each([
    [{ holdingId: "" }, "buy", NOT_FOUND.holding],
    [{ accountId: "" }, "buy", "扣款的帳戶"],
    [{ accountId: "" }, "sell", "入帳的帳戶"],
    [{ shares: "0" }, "buy", "至少 1 股"],
    [{ amount: "0" }, "sell", "至少 1 元"],
    [{ date: "2026-10-15" }, "buy", "未來"],
  ] as const)("%j（%s）_錯誤提到「%s」", (fields, side, keyword) => {
    expect(parseTradeFields(trade(fields), side, TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});
