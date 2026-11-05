import { describe, expect, it } from "vitest";
import { cardHeading, kindChipClass, rideText, routeLabel } from "../transit-view";

describe("rideText：要坐多久", () => {
  it.each([[94, "1 小時 34 分"], [45, "45 分"], [120, "2 小時"]])("%i 分鐘寫成 %s", (minutes, text) => {
    expect(rideText(minutes)).toBe(text);
  });
});

describe("routeLabel", () => {
  const stations = { originName: "台北", destinationName: "左營" };

  it("火車寫車次", () => {
    expect(routeLabel({ mode: "thsr", line: "0123", ...stations })).toBe("0123 車次 台北 → 左營");
  });

  it("以前存的路線沒有車次_只寫起訖", () => {
    expect(routeLabel({ mode: "tra", line: "", ...stations })).toBe("台北 → 左營");
  });

  it("公車寫路線與方向", () => {
    expect(routeLabel({ mode: "bus", line: "307", originName: "板橋", destinationName: "臺北車站" })).toBe("307 板橋 → 往臺北車站");
  });
});

describe("kindChipClass：車種標籤的顏色", () => {
  it.each([["自強"], ["自強(3000)"], ["新自強"], ["普悠瑪"], ["太魯閣"]])("%s 是紅色", (kind) => {
    expect(kindChipClass(kind)).toContain("chip-danger");
  });

  it.each([["莒光"], ["莒光(無身障座位)"]])("%s 是黃色", (kind) => {
    expect(kindChipClass(kind)).toContain("chip-warning");
  });

  it.each([["區間"], ["區間快"]])("%s 是藍色", (kind) => {
    expect(kindChipClass(kind)).toContain("chip-accent");
  });

  it("其他車種沒有顏色 字一樣是深色", () => {
    expect(kindChipClass("普快")).toBe("chip text-ink");
  });
});

describe("cardHeading：常用路線小卡的標題", () => {
  const stations = { originName: "臺北", destinationName: "高雄" };

  it("火車寫車次", () => {
    expect(cardHeading({ mode: "tra", line: "150", ...stations })).toBe("150 車次");
  });

  it("公車寫路線", () => {
    expect(cardHeading({ mode: "bus", line: "307", originName: "板橋", destinationName: "臺北車站" })).toBe("307");
  });

  it("捷運寫方向", () => {
    expect(cardHeading({ mode: "metro", line: "", originName: "府中", destinationName: "南港展覽館" })).toBe("往南港展覽館");
  });

  it("以前存的路線沒有車次_寫整段路", () => {
    expect(cardHeading({ mode: "thsr", line: "", originName: "台北", destinationName: "左營" })).toBe("台北 → 左營");
  });
});
