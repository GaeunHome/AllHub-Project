import { describe, expect, it } from "vitest";
import { asArray, asRecord, boolOf, createMissing, numberOf, text } from "./json";

describe("安全讀外部回應的欄位（core/json）", () => {
  it("asRecord：只收一般的物件，陣列、null、字串都不算", () => {
    expect(asRecord({ retcode: 0 })).toEqual({ retcode: 0 });
    for (const value of [[], null, undefined, "data", 1]) expect(asRecord(value)).toBeNull();
  });

  it("asArray：不是陣列時當成空的", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    for (const value of [{ length: 1 }, null, "list"]) expect(asArray(value)).toEqual([]);
  });

  it("text：原樣回傳不修剪，只有空白的當成沒有；allowBlank 時空字串也照收", () => {
    expect(text(" 開拓者 ")).toBe(" 開拓者 ");
    for (const value of ["", "   ", 5, null]) expect(text(value)).toBeNull();
    expect(text("", { allowBlank: true })).toBe("");
    expect(text(5, { allowBlank: true })).toBeNull();
  });

  it("numberOf：數字或寫成數字的字串，空白、不是數字、無限大都當成沒有", () => {
    expect(numberOf(240)).toBe(240);
    expect(numberOf("30")).toBe(30);
    expect(numberOf(" 12.5 ")).toBe(12.5);
    for (const value of ["", "  ", "abc", Number.NaN, Number.POSITIVE_INFINITY, "Infinity", null, true]) expect(numberOf(value)).toBeNull();
  });

  it("numberOf 的 stringsOnly：只收字串（氣象署的降雨機率與溫度一律是字串），JSON 的數字當成沒有", () => {
    expect(numberOf("60", { stringsOnly: true })).toBe(60);
    expect(numberOf(60, { stringsOnly: true })).toBeNull();
  });

  it("boolOf：只收 true／false，字串的 \"true\" 不算", () => {
    expect(boolOf(true)).toBe(true);
    expect(boolOf(false)).toBe(false);
    for (const value of ["true", 1, null]) expect(boolOf(value)).toBeNull();
  });

  it("createMissing：記下讀不到的欄位路徑，不重複、照字母排；不記值", () => {
    const missing = createMissing();
    const data = { nickname: "開拓者", avatar_list: "壞掉的格式" };

    expect(missing.need(text(data.nickname), "nickname")).toBe("開拓者");
    expect(missing.need(numberOf(undefined), "level")).toBeNull();
    expect(missing.list(data, "avatar_list", "avatar_list")).toEqual([]);
    expect(missing.list(null, "avatar_list", "avatar_list")).toEqual([]);
    missing.add("current_stamina");

    expect(missing.sorted()).toEqual(["avatar_list", "current_stamina", "level"]);
  });
});
