import { describe, expect, it } from "vitest";
import { movedIds, swapTarget } from "../order";

describe("movedIds：畫面先換好的順序 伺服器也照這個算", () => {
  it("放到某一個前面", () => {
    expect(movedIds([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
  });

  it("null 是最後", () => {
    expect(movedIds([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it("要放的那一個不在了_放最後", () => {
    expect(movedIds([1, 2, 3], 1, 9)).toEqual([2, 3, 1]);
  });
});

describe("swapTarget：上移下移", () => {
  it("往前一格", () => {
    expect(swapTarget([1, 2, 3], 3, -1)).toEqual({ beforeId: 2 });
  });

  it("往後一格", () => {
    expect(swapTarget([1, 2, 3], 1, 1)).toEqual({ beforeId: 3 });
  });

  it("往後到最後", () => {
    expect(swapTarget([1, 2, 3], 2, 1)).toEqual({ beforeId: null });
  });

  it("已經在最邊邊_不動", () => {
    expect(swapTarget([1, 2, 3], 1, -1)).toBeNull();
    expect(swapTarget([1, 2, 3], 3, 1)).toBeNull();
  });
});
