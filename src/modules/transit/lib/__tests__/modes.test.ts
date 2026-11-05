import { describe, expect, it } from "vitest";
import { busLineOf, trainNoOf } from "../modes";

describe("常用路線的 line 欄位：公車是路線，火車是車次", () => {
  it.each([["thsr"], ["tra"]] as const)("%s 是車次", (mode) => {
    expect(trainNoOf({ mode, line: "123" })).toBe("123");
    expect(busLineOf({ mode, line: "123" })).toBe("");
  });

  it("公車是路線，不是車次", () => {
    expect(trainNoOf({ mode: "bus", line: "307" })).toBe("");
    expect(busLineOf({ mode: "bus", line: "307" })).toBe("307");
  });

  it("捷運兩個都沒有", () => {
    expect(trainNoOf({ mode: "metro", line: "" })).toBe("");
    expect(busLineOf({ mode: "metro", line: "" })).toBe("");
  });
});
