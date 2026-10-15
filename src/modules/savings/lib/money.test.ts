import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, formatSignedTwd, formatTwd } from "./money";

describe("formatTwd", () => {
  it.each([
    [5000, "$5,000"],
    [0, "$0"],
    [1234567, "$1,234,567"],
  ])("%i 元_顯示成 %s", (amount, expected) => {
    expect(formatTwd(amount)).toBe(expected);
  });

  it("上限 1 億_照樣有千分位", () => {
    expect(formatTwd(MAX_AMOUNT)).toBe("$100,000,000");
  });

  it("累計超過 int 範圍_不會溢位", () => {
    expect(formatTwd(3_000_000_000)).toBe("$3,000,000,000");
  });

  it("負數（信用卡未繳、透支）_帶負號", () => {
    expect(formatTwd(-1200)).toBe("-$1,200");
  });
});

describe("formatSignedTwd（有方向的金額）", () => {
  it.each([
    [43_000, "+$43,000"],
    [-350, "-$350"],
    [0, "$0"],
  ])("%i 元_顯示成 %s", (amount, expected) => {
    expect(formatSignedTwd(amount)).toBe(expected);
  });
});
