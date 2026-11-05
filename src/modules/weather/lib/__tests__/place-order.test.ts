import { describe, expect, it } from "vitest";
import { beforeIdOf, clampDrag, dragTarget, movedIds, shiftAt, swapTarget } from "../../lib/place-order";

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

describe("dragTarget：拖到哪裡算換位", () => {
  // 三顆寬度不同 間距 6 中線是 60、201、330
  const slots = [{ id: 1, left: 0, width: 120 }, { id: 2, left: 126, width: 150 }, { id: 3, left: 282, width: 96 }];

  it("往右：右緣蓋過右邊那顆的中線才換", () => {
    expect(dragTarget(slots, 1, 180)).toBe(1);
    expect(dragTarget(slots, 1, 181)).toBe(2);
  });

  it("往左：左緣蓋過左邊那顆的中線才換", () => {
    expect(dragTarget(slots, 1, 60)).toBe(1);
    expect(dragTarget(slots, 1, 59)).toBe(0);
  });

  it("左右要拖的距離差不多（以前往右要 188px、往左只要 83px）", () => {
    const start = slots[1].left;
    expect(dragTarget(slots, 1, start + 55)).toBe(2);
    expect(dragTarget(slots, 1, start - 67)).toBe(0);
  });

  it("沒有動_留在原位", () => {
    expect(dragTarget(slots, 1, 126)).toBe(1);
  });

  it("一次拖過好幾顆", () => {
    const row = [0, 110, 220, 330].map((left, index) => ({ id: index + 1, left, width: 100 }));
    expect(dragTarget(row, 0, 61)).toBe(1);
    expect(dragTarget(row, 0, 171)).toBe(2);
    expect(dragTarget(row, 0, 281)).toBe(3);
    expect(dragTarget(row, 3, 269)).toBe(2);
    expect(dragTarget(row, 3, 159)).toBe(1);
    expect(dragTarget(row, 3, 49)).toBe(0);
  });
});

describe("clampDrag：只能在可以排序的範圍裡拖", () => {
  const slots = [{ id: 1, left: 40, width: 120 }, { id: 2, left: 166, width: 150 }, { id: 3, left: 322, width: 96 }];

  it("不能蓋過前面固定的首頁縣市", () => {
    expect(clampDrag(slots, 1, 0)).toBe(40);
  });

  it("不能超過最後一顆的右緣", () => {
    expect(clampDrag(slots, 1, 999)).toBe(268);
  });

  it("範圍內照手的位置", () => {
    expect(clampDrag(slots, 1, 100)).toBe(100);
  });
});

describe("shiftAt：旁邊的膠囊讓位", () => {
  const slots = [{ id: 1, left: 0, width: 120 }, { id: 2, left: 126, width: 150 }, { id: 3, left: 282, width: 96 }];

  it("往右拖_右邊那顆往左讓出拖的那顆的寬度加間距", () => {
    expect(shiftAt(slots, 1, 2, 2)).toBe(-156);
    expect(shiftAt(slots, 1, 2, 0)).toBe(0);
  });

  it("往左拖_左邊那顆往右讓", () => {
    expect(shiftAt(slots, 1, 0, 0)).toBe(156);
    expect(shiftAt(slots, 1, 0, 2)).toBe(0);
  });

  it("留在原位_都不動", () => {
    expect(shiftAt(slots, 1, 1, 0)).toBe(0);
    expect(shiftAt(slots, 1, 1, 2)).toBe(0);
  });
});

describe("beforeIdOf：放開時存到伺服器的位置", () => {
  const slots = [{ id: 1, left: 0, width: 100 }, { id: 2, left: 110, width: 100 }, { id: 3, left: 220, width: 100 }];

  it("排到最前面_放在第一顆前面", () => {
    expect(beforeIdOf(slots, 2, 0)).toBe(1);
  });

  it("排到最後_是 null", () => {
    expect(beforeIdOf(slots, 0, 2)).toBeNull();
  });

  it("留在原位_放在原本的下一顆前面", () => {
    expect(beforeIdOf(slots, 1, 1)).toBe(3);
  });

  it("算出來的位置跟 movedIds 接得起來", () => {
    expect(movedIds([1, 2, 3], 1, beforeIdOf(slots, 0, 1))).toEqual([2, 1, 3]);
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
