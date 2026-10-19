import { describe, expect, it } from "vitest";
import { SELECTABLE_COLORS, nextFreeColor } from "./kinds";

describe("nextFreeColor：新增分類時伺服器給的顏色", () => {
  it("挑還沒用過的第一個顏色", () => {
    expect(nextFreeColor([])).toBe("blue");
    expect(nextFreeColor(["blue", "teal"])).toBe("green");
  });

  it("灰色留給未分類：其他顏色都用過了也不會挑灰色", () => {
    expect(nextFreeColor(["blue", "teal", "green", "amber", "orange", "rose", "violet"])).not.toBe("slate");
    expect(nextFreeColor(["slate"])).toBe("blue");
  });

  it("七個可以選的顏色都用過了_照數量輪替", () => {
    expect(nextFreeColor([...SELECTABLE_COLORS])).toBe("blue");
    expect(nextFreeColor([...SELECTABLE_COLORS, "blue"])).toBe("teal");
  });
});
