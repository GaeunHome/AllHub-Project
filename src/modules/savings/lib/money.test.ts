import { describe, expect, it, onTestFinished, vi } from "vitest";
import { MAX_AMOUNT, formatNumber, formatSignedTwd, formatTwd } from "./money";

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

describe("金額與數字的寫法不看執行環境的語系資料", () => {
  // 伺服器與瀏覽器的 ICU 不同時 Intl 的輸出會變 算繪出來就對不上
  it("Intl.NumberFormat 輸出不同時_照樣是同一個寫法", () => {
    const format = vi.spyOn(Intl.NumberFormat.prototype as { format: unknown }, "format", "get").mockImplementation(() => () => "１２３４");
    onTestFinished(() => format.mockRestore());

    expect([formatTwd(-1234), formatSignedTwd(1234), formatSignedTwd(0), formatNumber(1234)]).toEqual(["-$1,234", "+$1,234", "$0", "1,234"]);
  });
});
