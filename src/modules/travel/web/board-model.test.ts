import { describe, expect, it } from "vitest";
import type { TripItem } from "../service/trips";
import { adjacentListMove, beforeIdAt, isSamePlace, itemsOfDay, moveInBoard, neighbourMove } from "./board-model";

const DAY = "2026-12-01";
const item = (id: number, day: string | null, position: number) => ({ id, day, position, title: `項目${id}` }) as TripItem;
const ITEMS = [item(1, DAY, 0), item(2, DAY, 1), item(3, DAY, 2), item(4, null, 0)];
const ids = (items: TripItem[], day: string | null = DAY) => itemsOfDay(items, day).map((row) => row.id);

describe("放開時畫面先換好", () => {
  it("同一天往前移", () => {
    expect(ids(moveInBoard(ITEMS, { itemId: 3, toDay: DAY, beforeId: 1 }))).toEqual([3, 1, 2]);
  });

  it("放到最後", () => {
    expect(ids(moveInBoard(ITEMS, { itemId: 1, toDay: DAY, beforeId: null }))).toEqual([2, 3, 1]);
  });

  it("從想去的點拖進某一天，原本那一排少一項", () => {
    const moved = moveInBoard(ITEMS, { itemId: 4, toDay: DAY, beforeId: 2 });

    expect(ids(moved)).toEqual([1, 4, 2, 3]);
    expect(ids(moved, null)).toEqual([]);
  });

  it("要放在它前面的那一項不在那一排：放最後，跟伺服器一樣", () => {
    expect(ids(moveInBoard(ITEMS, { itemId: 4, toDay: DAY, beforeId: 999 }))).toEqual([1, 2, 3, 4]);
  });

  it("找不到項目時不動", () => {
    expect(moveInBoard(ITEMS, { itemId: 999, toDay: DAY, beforeId: null })).toEqual(ITEMS);
  });
});

describe("上移下移（拖曳的替代方式）", () => {
  it("上移：放到前一項前面", () => {
    expect(ids(moveInBoard(ITEMS, neighbourMove(ITEMS, 2, -1)!))).toEqual([2, 1, 3]);
  });

  it("下移：放到下一項後面", () => {
    expect(ids(moveInBoard(ITEMS, neighbourMove(ITEMS, 1, 1)!))).toEqual([2, 1, 3]);
  });

  it("下移到最後一格", () => {
    expect(ids(moveInBoard(ITEMS, neighbourMove(ITEMS, 2, 1)!))).toEqual([1, 3, 2]);
  });

  it("已經在最前面或最後面時沒有下一步", () => {
    expect(neighbourMove(ITEMS, 1, -1)).toBeUndefined();
    expect(neighbourMove(ITEMS, 3, 1)).toBeUndefined();
  });
});

describe("放在原位不算移動：不然會白送一次修改，還通知同行的人", () => {
  it("放回自己原本的位置", () => {
    expect(isSamePlace(ITEMS, { itemId: 2, toDay: DAY, beforeId: 3 })).toBe(true);
    expect(isSamePlace(ITEMS, { itemId: 3, toDay: DAY, beforeId: null })).toBe(true);
  });

  it("換了位置或換了天都算移動", () => {
    expect(isSamePlace(ITEMS, { itemId: 2, toDay: DAY, beforeId: 1 })).toBe(false);
    expect(isSamePlace(ITEMS, { itemId: 1, toDay: DAY, beforeId: null })).toBe(false);
    expect(isSamePlace(ITEMS, { itemId: 2, toDay: null, beforeId: null })).toBe(false);
  });

  it("要放在它前面的那一項不在那一排：實際上是放最後", () => {
    expect(isSamePlace(ITEMS, { itemId: 3, toDay: DAY, beforeId: 999 })).toBe(true);
  });
});

describe("手指或游標在哪兩項之間", () => {
  const CARDS = [
    { id: 1, top: 100, height: 40 },
    { id: 2, top: 150, height: 40 },
  ];

  it("在一項上半部放它前面，下半部放下一項前面", () => {
    expect(beforeIdAt(CARDS, 110)).toBe(1);
    expect(beforeIdAt(CARDS, 130)).toBe(2);
  });

  it("比最後一項的一半還低：放最後", () => {
    expect(beforeIdAt(CARDS, 175)).toBeNull();
    expect(beforeIdAt(CARDS, 900)).toBeNull();
  });

  it("空的那一天：放進去", () => {
    expect(beforeIdAt([], 100)).toBeNull();
  });
});

describe("方向鍵左右移到旁邊那一排", () => {
  const LISTS = [null, DAY, "2026-12-02"];

  it("往右移到下一天的最後", () => {
    expect(adjacentListMove(ITEMS, LISTS, 1, 1)).toEqual({ itemId: 1, toDay: "2026-12-02", beforeId: null });
  });

  it("往左移回想去的點", () => {
    expect(adjacentListMove(ITEMS, LISTS, 1, -1)).toEqual({ itemId: 1, toDay: null, beforeId: null });
  });

  it("已經在最左邊或最右邊時沒有下一步", () => {
    expect(adjacentListMove(ITEMS, LISTS, 4, -1)).toBeUndefined();
    expect(adjacentListMove(ITEMS, [DAY], 1, 1)).toBeUndefined();
  });
});
