import { describe, expect, it } from "vitest";
import { frequentStations } from "../frequent-stations";

const route = (overrides = {}) => ({ mode: "tra" as const, system: "", originId: "1000", originName: "臺北", destinationId: "4400", destinationName: "高雄", ...overrides });

describe("frequentStations：常用路線用過的車站", () => {
  it("使用者要的：只看同一種交通工具", () => {
    const routes = [route(), route({ mode: "thsr", originId: "1", originName: "左營", destinationId: "2", destinationName: "台北" })];

    expect(frequentStations(routes, "tra").map((station) => station.name)).toEqual(["臺北", "高雄"]);
  });

  it("捷運不分系統一起算 選站時三個系統本來就在一起", () => {
    const routes = [route({ mode: "metro", system: "TRTC", originId: "R10", originName: "台北車站", destinationId: "R28", destinationName: "淡水" }), route({ mode: "metro", system: "TYMC", originId: "A12", originName: "機場第一航廈", destinationId: "A1", destinationName: "臺北車站" })];

    expect(frequentStations(routes, "metro")).toEqual([{ id: "R10", name: "台北車站" }, { id: "A12", name: "機場第一航廈" }]);
  });

  it("捷運的迄站是開往的終點站 不是用過的車站", () => {
    const routes = [route({ mode: "metro", system: "TRTC", originId: "R10", originName: "台北車站", destinationId: "R28", destinationName: "淡水" })];

    expect(frequentStations(routes, "metro")).toEqual([{ id: "R10", name: "台北車站" }]);
  });

  it("同一站只列一次 用得多的排前面 一樣多照存的順序", () => {
    const routes = [route({ originId: "1000", originName: "臺北", destinationId: "1020", destinationName: "板橋" }), route({ originId: "1210", originName: "新竹", destinationId: "4400", destinationName: "高雄" }), route({ originId: "1020", originName: "板橋", destinationId: "4400", destinationName: "高雄" })];

    expect(frequentStations(routes, "tra").map((station) => station.name)).toEqual(["板橋", "高雄", "臺北", "新竹"]);
  });

  it("沒有常用路線時是空的 面板不顯示這一區", () => {
    expect(frequentStations([], "tra")).toEqual([]);
  });
});
