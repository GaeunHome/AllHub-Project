import { describe, expect, it } from "vitest";
import { rideText, routeLabel } from "../transit-view";

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
