import { describe, expect, it } from "vitest";
import { moveInOrder } from "./order";

describe("moveInOrder", () => {
  it("往上_跟前一個交換", () => {
    expect(moveInOrder([1, 2, 3], 3, "up")).toEqual([1, 3, 2]);
  });

  it("往下_跟後一個交換", () => {
    expect(moveInOrder([1, 2, 3], 1, "down")).toEqual([2, 1, 3]);
  });

  it("第一個再往上_不用動", () => {
    expect(moveInOrder([1, 2, 3], 1, "up")).toBeNull();
  });

  it("最後一個再往下_不用動", () => {
    expect(moveInOrder([1, 2, 3], 3, "down")).toBeNull();
  });

  it("找不到這個 id_不用動", () => {
    expect(moveInOrder([1, 2, 3], 9, "up")).toBeNull();
  });

  it("不改到傳進來的陣列", () => {
    const ids = [1, 2, 3];
    moveInOrder(ids, 2, "up");
    expect(ids).toEqual([1, 2, 3]);
  });
});
