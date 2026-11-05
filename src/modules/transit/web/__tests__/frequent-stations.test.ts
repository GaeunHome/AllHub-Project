import { describe, expect, it } from "vitest";
import { frequentStations } from "../frequent-stations";

const route = (overrides = {}) => ({ mode: "tra" as const, system: "", originId: "1000", originName: "臺北", destinationId: "4400", destinationName: "高雄", ...overrides });

describe("frequentStations：常用路線用過的車站", () => {
  it("使用者要的：只看同一種交通工具", () => {
    const routes = [route(), route({ mode: "thsr", originId: "1", originName: "左營", destinationId: "2", destinationName: "台北" })];

    expect(frequentStations(routes, { mode: "tra", system: "TRTC" }).map((station) => station.name)).toEqual(["臺北", "高雄"]);
  });

  it("使用者要的：捷運只看同一個系統", () => {
    const routes = [route({ mode: "metro", system: "TRTC", originId: "R10", originName: "台北車站", destinationId: "R28", destinationName: "淡水" }), route({ mode: "metro", system: "KRTC", originId: "O5", originName: "美麗島", destinationId: "O14", destinationName: "大寮" })];

    expect(frequentStations(routes, { mode: "metro", system: "KRTC" })).toEqual([{ id: "O5", name: "美麗島" }]);
  });

  it("捷運的迄站是開往的終點站 不是用過的車站", () => {
    const routes = [route({ mode: "metro", system: "TRTC", originId: "R10", originName: "台北車站", destinationId: "R28", destinationName: "淡水" })];

    expect(frequentStations(routes, { mode: "metro", system: "TRTC" })).toEqual([{ id: "R10", name: "台北車站" }]);
  });

  it("同一站只列一次 用得多的排前面 一樣多照存的順序", () => {
    const routes = [route({ originId: "1000", originName: "臺北", destinationId: "1020", destinationName: "板橋" }), route({ originId: "1210", originName: "新竹", destinationId: "4400", destinationName: "高雄" }), route({ originId: "1020", originName: "板橋", destinationId: "4400", destinationName: "高雄" })];

    expect(frequentStations(routes, { mode: "tra", system: "TRTC" }).map((station) => station.name)).toEqual(["板橋", "高雄", "臺北", "新竹"]);
  });

  it("沒有常用路線時是空的 面板不顯示這一區", () => {
    expect(frequentStations([], { mode: "tra", system: "TRTC" })).toEqual([]);
  });
});
