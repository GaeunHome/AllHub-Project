import { describe, expect, it } from "vitest";
import { groupDigits } from "./number";

describe("groupDigits：千分位自己加，不依賴執行環境的語系資料", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1,000"],
    [1234567, "1,234,567"],
    [-1500, "-1,500"],
    [-999, "-999"],
    [1234.4, "1,234"],
    [999.5, "1,000"],
  ])("%d → %s", (value, expected) => {
    expect(groupDigits(value)).toBe(expected);
  });
});
