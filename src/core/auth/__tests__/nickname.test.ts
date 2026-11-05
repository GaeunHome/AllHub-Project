import { describe, expect, it } from "vitest";
import { displayNameOf, nicknameProblem, normalizeNickname } from "../nickname";

describe("暱稱的規則", () => {
  it("去掉頭尾空白，連續空白縮成一個（全形空白與換行也算）", () => {
    expect(normalizeNickname("  小明  ")).toBe("小明");
    expect(normalizeNickname("小明　　的\n\n帳號")).toBe("小明 的 帳號");
  });

  it("NFC 正規化：組合字元跟預組字元存成同一個字串", () => {
    expect(normalizeNickname("Café")).toBe("Café");
  });

  it("空字串與只有空白_回到 null", () => {
    expect(normalizeNickname("")).toBeNull();
    expect(normalizeNickname("   　\n")).toBeNull();
  });

  it("20 個字可以，21 個字被拒絕；emoji 算一個字", () => {
    expect(nicknameProblem("一".repeat(20))).toBeNull();
    expect(nicknameProblem("一".repeat(21))).toEqual(expect.any(String));
    expect(nicknameProblem("😀".repeat(20))).toBeNull();
  });

  it("清空（null）沒有問題", () => {
    expect(nicknameProblem(null)).toBeNull();
  });

  it("顯示時有暱稱用暱稱，沒有用帳號名稱", () => {
    expect(displayNameOf({ nickname: "小明", username: "bob" })).toBe("小明");
    expect(displayNameOf({ nickname: null, username: "bob" })).toBe("bob");
  });
});
