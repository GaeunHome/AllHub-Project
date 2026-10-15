import { describe, expect, it } from "vitest";
import { splitRecentCheckins } from "./recent-checkins";

/** 跟資料庫讀出來的一樣新的在前 id 越大越新 */
const newestFirst = (count: number) => Array.from({ length: count }, (_, index) => ({ id: count - index }));
const ids = (list: { id: number }[]) => list.map((item) => item.id);

describe("splitRecentCheckins：簽到紀錄先列最近幾筆，更早的收起來", () => {
  it("超過 5 筆_最新的 5 筆在 recent，其餘照原本的順序（新的在前）放進 earlier", () => {
    const { recent, earlier } = splitRecentCheckins(newestFirst(17));

    expect(ids(recent)).toEqual([17, 16, 15, 14, 13]);
    expect(ids(earlier)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("6 筆_只有最舊的 1 筆收起來", () => {
    const { recent, earlier } = splitRecentCheckins(newestFirst(6));

    expect(ids(recent)).toEqual([6, 5, 4, 3, 2]);
    expect(ids(earlier)).toEqual([1]);
  });

  it("剛好 5 筆或更少_全部直接列出，沒有要收起來的", () => {
    expect(splitRecentCheckins(newestFirst(5))).toEqual({ recent: newestFirst(5), earlier: [] });
    expect(splitRecentCheckins(newestFirst(2))).toEqual({ recent: newestFirst(2), earlier: [] });
  });

  it("沒有紀錄_兩邊都是空的", () => {
    expect(splitRecentCheckins([])).toEqual({ recent: [], earlier: [] });
  });
});
