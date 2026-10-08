import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, NOTE_MAX_LENGTH, parseAmount, parseEntryFields, parseGoalFields } from "./validation";

describe("parseAmount", () => {
  it.each([
    ["5000", 5000],
    ["1", 1],
    ["100000000", 100_000_000],
    [" 3000 ", 3000],
    ["5,000", 5000],
    ["1,234,567", 1_234_567],
  ])("%j_是 %i 元", (raw, expected) => {
    expect(parseAmount(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   "])("%j_要求輸入金額", (raw) => {
    expect(parseAmount(raw)).toEqual({ ok: false, error: "請輸入金額" });
  });

  it.each([["-100", "負數"], ["1.5", "小數"], ["1e3", "科學記號"], ["abc", "文字"], ["5,00", "千分位位置不對"], ["NaN", "NaN"], ["Infinity", "無限大"]])(
    "%j（%s）_只接受正整數",
    (raw) => {
      expect(parseAmount(raw)).toEqual({ ok: false, error: "金額只能是正整數（單位：元，不能有小數或負數）" });
    },
  );

  it("0 元_至少要 1 元", () => {
    expect(parseAmount("0")).toEqual({ ok: false, error: "金額至少 1 元" });
  });

  it.each(["100000001", "99999999999999999999"])("%j_超過 1 億", (raw) => {
    expect(parseAmount(raw)).toEqual({ ok: false, error: "金額不能超過 1 億元" });
  });
});

describe("parseGoalFields", () => {
  it("合法_名稱與備註去掉前後空白_空備註存成 null", () => {
    expect(parseGoalFields({ name: "  旅遊基金 ", monthlyAmount: "5000", note: "   " })).toEqual({
      ok: true,
      value: { name: "旅遊基金", monthlyAmount: 5000, note: null },
    });
  });

  it("有備註_保留", () => {
    expect(parseGoalFields({ name: "緊急預備金", monthlyAmount: "10000", note: " 存到半年生活費 " })).toEqual({
      ok: true,
      value: { name: "緊急預備金", monthlyAmount: 10000, note: "存到半年生活費" },
    });
  });

  it("名稱空白_要求輸入名稱", () => {
    expect(parseGoalFields({ name: "  ", monthlyAmount: "5000", note: "" })).toEqual({ ok: false, error: "請輸入項目名稱" });
  });

  it("名稱剛好上限_可以（emoji 算一個字）", () => {
    const name = "🐷" + "存".repeat(NAME_MAX_LENGTH - 1);
    expect(parseGoalFields({ name, monthlyAmount: "1", note: "" })).toMatchObject({ ok: true, value: { name } });
  });

  it("名稱超過上限_錯誤", () => {
    expect(parseGoalFields({ name: "存".repeat(NAME_MAX_LENGTH + 1), monthlyAmount: "1", note: "" })).toEqual({
      ok: false,
      error: `名稱最多 ${NAME_MAX_LENGTH} 個字`,
    });
  });

  it("金額不合法_回金額的錯誤", () => {
    expect(parseGoalFields({ name: "旅遊基金", monthlyAmount: "-5", note: "" })).toEqual({
      ok: false,
      error: "金額只能是正整數（單位：元，不能有小數或負數）",
    });
  });

  it("備註超過上限_錯誤", () => {
    expect(parseGoalFields({ name: "旅遊基金", monthlyAmount: "5000", note: "字".repeat(NOTE_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      error: `備註最多 ${NOTE_MAX_LENGTH} 個字`,
    });
  });
});

describe("parseEntryFields", () => {
  const current = "2026-10";

  it("合法_金額轉成數字_空備註存成 null", () => {
    expect(parseEntryFields({ month: "2026-09", amount: "3000", note: "" }, current)).toEqual({
      ok: true,
      value: { month: "2026-09", amount: 3000, note: null },
    });
  });

  it("本月_可以", () => {
    expect(parseEntryFields({ month: "2026-10", amount: "1", note: "年終獎金" }, current)).toEqual({
      ok: true,
      value: { month: "2026-10", amount: 1, note: "年終獎金" },
    });
  });

  it.each(["2026-13", "", "1999-12"])("月份 %j_不正確", (month) => {
    expect(parseEntryFields({ month, amount: "3000", note: "" }, current)).toEqual({ ok: false, error: "月份不正確" });
  });

  it("未來的月份_不能記錄", () => {
    expect(parseEntryFields({ month: "2026-11", amount: "3000", note: "" }, current)).toEqual({ ok: false, error: "不能記錄未來的月份" });
  });

  it("金額不合法_回金額的錯誤", () => {
    expect(parseEntryFields({ month: "2026-10", amount: "0", note: "" }, current)).toEqual({ ok: false, error: "金額至少 1 元" });
  });

  it("備註超過上限_錯誤", () => {
    expect(parseEntryFields({ month: "2026-10", amount: "100", note: "字".repeat(NOTE_MAX_LENGTH + 1) }, current)).toEqual({
      ok: false,
      error: `備註最多 ${NOTE_MAX_LENGTH} 個字`,
    });
  });
});
