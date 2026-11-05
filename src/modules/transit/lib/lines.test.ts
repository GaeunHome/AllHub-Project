import { describe, expect, it } from "vitest";
import { routeColor } from "./lines";

describe("routeColor：路線圖的顏色", () => {
  it("捷運照車站代碼開頭的路線", () => {
    expect(routeColor("metro", "TRTC", "R10")).toBe("#e3002c");
    expect(routeColor("metro", "TRTC", "BL12")).toBe("#0070bd");
  });

  it("文湖線 BR 不能被當成別的線", () => {
    expect(routeColor("metro", "TRTC", "BR10")).toBe("#c48c31");
  });

  it("認不得的路線用預設色 不是沒有顏色", () => {
    expect(routeColor("metro", "NTALRT", "K01")).toMatch(/^#/);
  });

  it("高鐵與台鐵不看車站", () => {
    expect(routeColor("thsr", "", "1000")).not.toBe(routeColor("tra", "", "1000"));
  });
});
