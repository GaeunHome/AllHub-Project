import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageNumbers, pageSlice } from "../paging";

describe("查詢結果分頁（使用者要的：班次多時用分頁 不用時段分組）", () => {
  it("一頁 10 班 不滿一頁也算一頁", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(143)).toBe(15);
  });

  it("每一頁拿到的班次 最後一頁只有剩下的", () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(pageSlice(items, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageSlice(items, 3)).toEqual([21, 22, 23]);
  });

  it("頁數不多時全部列出", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("頁數多時留第一頁 最後一頁與目前這頁的前後 中間用 … 一律 7 格 按鈕才不會跳來跳去", () => {
    expect(pageNumbers(1, 15)).toEqual([1, 2, 3, 4, 5, "gap", 15]);
    expect(pageNumbers(4, 15)).toEqual([1, 2, 3, 4, 5, "gap", 15]);
    expect(pageNumbers(5, 15)).toEqual([1, "gap", 4, 5, 6, "gap", 15]);
    expect(pageNumbers(12, 15)).toEqual([1, "gap", 11, 12, 13, 14, 15]);
    expect(pageNumbers(15, 15)).toEqual([1, "gap", 11, 12, 13, 14, 15]);
  });
});
