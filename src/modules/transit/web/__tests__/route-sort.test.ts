import { describe, expect, it } from "vitest";
import { beforeIdOf, dropIndex } from "../route-sort";

describe("側邊欄拖曳排序（使用者要的：常用路線可以上下拖曳）", () => {
  it("手指過了哪幾張的中線 就排在它們後面", () => {
    // 其他三張卡片的中線在 100 300 500
    expect(dropIndex([100, 300, 500], 50)).toBe(0);
    expect(dropIndex([100, 300, 500], 301)).toBe(2);
    expect(dropIndex([100, 300, 500], 900)).toBe(3);
  });

  it("放好之後告訴伺服器放到哪一條前面 最後一條是 null", () => {
    expect(beforeIdOf([3, 1, 2], 3)).toBe(1);
    expect(beforeIdOf([1, 2, 3], 3)).toBeNull();
  });
});
