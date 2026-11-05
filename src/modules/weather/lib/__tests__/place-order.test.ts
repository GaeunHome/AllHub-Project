import { describe, expect, it } from "vitest";
import { beforeIdAt, movedIds, swapTarget } from "../../lib/place-order";

describe("movedIds：拖曳時畫面先換好的順序", () => {
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

describe("beforeIdAt：手指在哪一顆前面", () => {
  const chips = [{ id: 1, left: 0, width: 100 }, { id: 2, left: 110, width: 100 }, { id: 3, left: 220, width: 100 }];

  it("過了一顆的中線就排到它後面", () => {
    expect(beforeIdAt(chips, 40, 3)).toBe(1);
    expect(beforeIdAt(chips, 60, 3)).toBe(2);
    expect(beforeIdAt(chips, 170, 1)).toBe(3);
  });

  it("超過最後一顆的中線_放最後", () => {
    expect(beforeIdAt(chips, 300, 1)).toBeNull();
  });

  it("算的時候不看自己那一顆", () => {
    expect(beforeIdAt(chips, 150, 2)).toBe(3);
  });
});

describe("swapTarget：鍵盤左右鍵", () => {
  it("往左一格", () => {
    expect(swapTarget([1, 2, 3], 3, -1)).toEqual({ beforeId: 2 });
  });

  it("往右一格", () => {
    expect(swapTarget([1, 2, 3], 1, 1)).toEqual({ beforeId: 3 });
  });

  it("往右到最後", () => {
    expect(swapTarget([1, 2, 3], 2, 1)).toEqual({ beforeId: null });
  });

  it("已經在最邊邊_不動", () => {
    expect(swapTarget([1, 2, 3], 1, -1)).toBeNull();
    expect(swapTarget([1, 2, 3], 3, 1)).toBeNull();
  });
});
