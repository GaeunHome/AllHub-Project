import { describe, expect, it } from "vitest";
import { matchesStation } from "../station-search";

describe("matchesStation：打字找車站", () => {
  it("使用者要的：打台北要找得到臺北 打臺大也要找得到台大醫院", () => {
    expect(matchesStation("臺北", "台北")).toBe(true);
    expect(matchesStation("台大醫院", "臺大")).toBe(true);
  });

  it("使用者要的：站名結尾的站可打可不打", () => {
    expect(matchesStation("板橋", "板橋站")).toBe(true);
    expect(matchesStation("台北車站", "台北車站")).toBe(true);
    expect(matchesStation("台北車站", "台北車")).toBe(true);
  });

  it("只比對連續的字 不是有其中一個字就算", () => {
    expect(matchesStation("新竹", "竹新")).toBe(false);
    expect(matchesStation("臺南", "臺北")).toBe(false);
  });

  it("前後的空白 全形與大小寫不算差別", () => {
    expect(matchesStation("臺北", " 台北 ")).toBe(true);
    expect(matchesStation("台北101/世貿", "１０１")).toBe(true);
    expect(matchesStation("A1台北車站", "a1")).toBe(true);
  });

  it("只打一個站字時照字面找 不是全部都算", () => {
    expect(matchesStation("台北車站", "站")).toBe(true);
    expect(matchesStation("臺北", "站")).toBe(false);
  });

  it("還沒打字時全部都算", () => {
    expect(matchesStation("臺北", "")).toBe(true);
    expect(matchesStation("臺北", "   ")).toBe(true);
  });
});
