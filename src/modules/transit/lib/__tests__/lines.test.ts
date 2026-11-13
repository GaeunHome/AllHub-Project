import { describe, expect, it } from "vitest";
import { MODE_COLORS, metroLine, plateInk, routeColor } from "../lines";
import { METRO_SYSTEMS } from "../modes";
import { contrastRatio } from "../../dev/contrast";

const LINE_OF: Record<string, string> = { TRTC: "R", NTMC: "Y", TYMC: "A" };

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

describe("metroLine：捷運的路線名稱與顏色", () => {
  it("TDX 的 LineNo 對到路線名稱", () => {
    expect(metroLine("TRTC", "BL")).toEqual({ name: "板南線", color: "#0070bd" });
    expect(metroLine("TRTC", "BR").name).toBe("文湖線");
    expect(metroLine("TYMC", "A").name).toBe("機場線");
  });

  it("支線的 LineNo 也算同一條線 車站代碼一樣查得到", () => {
    expect(metroLine("TRTC", "G-1").name).toBe("松山新店線");
    expect(metroLine("TRTC", "BL12").name).toBe("板南線");
  });

  it("每個捷運系統都有名稱 畫面上才不會寫代碼", () => {
    expect(Object.keys(METRO_SYSTEMS).map((system) => metroLine(system, LINE_OF[system]).name)).not.toContain(null);
  });

  it("認不得的路線沒有名稱 顏色用預設色", () => {
    expect(metroLine("TRTC", "X")).toEqual({ name: null, color: routeColor("metro", "TRTC", "X1") });
  });
});


describe("plateInk：站牌代碼的字色", () => {
  it("使用者要的：文湖線的棕色與中和新蘆線的黃色用深色字", () => {
    const white = "#ffffff";

    expect(plateInk(metroLine("TRTC", "BR").color)).not.toBe(white);
    expect(plateInk(metroLine("TRTC", "O").color)).not.toBe(white);
  });

  it("板南線的藍色與淡水信義線的紅色用白字", () => {
    expect(plateInk(metroLine("TRTC", "BL").color)).toBe("#ffffff");
    expect(plateInk(metroLine("TRTC", "R").color)).toBe("#ffffff");
  });

  it.each([
    ["TRTC", "BR"],
    ["TRTC", "BL"],
    ["TRTC", "R"],
    ["TRTC", "G"],
    ["TRTC", "O"],
    ["NTMC", "Y"],
    ["TYMC", "A"],
    ["TRTC", "認不得的路線"],
  ])("%s %s 的底色配上選到的字色至少 4.5:1", (system, code) => {
    const { color } = metroLine(system, code);

    expect(contrastRatio(color, plateInk(color))).toBeGreaterThanOrEqual(4.5);
  });

  it("分頁的捷運顏色也是這個預設色", () => {
    expect(contrastRatio(MODE_COLORS.metro, plateInk(MODE_COLORS.metro))).toBeGreaterThanOrEqual(4.5);
  });
});
