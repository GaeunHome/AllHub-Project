import { describe, expect, it } from "vitest";
import { TRANSFER_MINUTES, legSchedule, legSeconds, parseTravelTimes, tripMinutes } from "../travel-time";

// 格式照 TDX 的真實回應 臺北捷運只列一個方向 第一段的停站時間是 0 停站時間是起站的

const step = (FromStationID: string, ToStationID: string, RunTime: number, StopTime: number) => ({ FromStationID, ToStationID, RunTime, StopTime });
const BLUE = [{ LineID: "BL", RouteID: "BL-1", TrainType: 1, TravelTimes: [step("BL23", "BL22", 112, 0), step("BL22", "BL21", 109, 24), step("BL21", "BL20", 100, 30), step("BL20", "BL19", 90, 26)] }];
const times = parseTravelTimes(BLUE).times;

describe("legSeconds：一段路要坐多久", () => {
  it("相鄰兩站就是行駛時間 不加停站", () => {
    expect(legSeconds(["BL22", "BL21"], times)).toBe(109);
  });

  it("中間的站要加停站時間 上車與下車的站不加：109 + 30 + 100", () => {
    expect(legSeconds(["BL22", "BL21", "BL20"], times)).toBe(239);
  });

  it("TDX 只列一個方向 反方向一樣算得出來：100 + 30 + 109", () => {
    expect(legSeconds(["BL20", "BL21", "BL22"], times)).toBe(239);
  });

  it("少了一段就不算 不能用少算的時間", () => {
    expect(legSeconds(["BL20", "BL19", "BL18"], times)).toBeNull();
  });

  it("行駛時間是 0 的是 TDX 還沒補上的新路段 當成沒有", () => {
    const { times: broken } = parseTravelTimes([{ TrainType: 1, TravelTimes: [step("R01", "R02", 0, 0)] }]);

    expect(legSeconds(["R01", "R02"], broken)).toBeNull();
  });

  it("只有一站時沒有時間", () => {
    expect(legSeconds(["BL20"], times)).toBeNull();
  });

  it("同一站在折返的路線停比較久 用最短的 不然多算幾分鐘", () => {
    const { times: routes } = parseTravelTimes([
      { TrainType: 1, TravelTimes: [step("A", "B", 60, 0), step("B", "C", 60, 25)] },
      { TrainType: 1, TravelTimes: [step("X", "B", 60, 0), step("B", "C", 60, 240)] },
    ]);

    expect(legSeconds(["A", "B", "C"], routes)).toBe(145);
  });
});

describe("機場捷運的回應是任兩站的表", () => {
  // 真實回應 A1 到 A3 不是相鄰也有一列 直達車另外一組
  const AIRPORT = [
    { LineID: "A", RouteID: "", TrainType: 1, TravelTimes: [step("A1", "A2", 300, 0), step("A1", "A3", 540, 0), step("A2", "A3", 180, 0), step("A3", "A1", 540, 0)] },
    { LineID: "A", RouteID: "", TrainType: 2, TravelTimes: [step("A1", "A3", 480, 0)] },
  ];
  const airport = parseTravelTimes(AIRPORT).times;

  it("起訖站有一列就直接用 不是一站一站加", () => {
    expect(legSeconds(["A1", "A2", "A3"], airport)).toBe(540);
  });

  it("路線只算普通車 直達車不停這些站", () => {
    expect(legSeconds(["A3", "A2", "A1"], airport)).toBe(540);
  });
});

describe("tripMinutes：整趟路約幾分鐘", () => {
  const leg = (system: string, stationIds: string[]) => ({ system, stationIds });

  it("一段就是這段的時間 四捨五入到分鐘：239 秒是 4 分", () => {
    expect(tripMinutes([leg("TRTC", ["BL22", "BL21", "BL20"])], { TRTC: times })).toBe(4);
  });

  it("每轉乘一次加固定的時間 兩段都是 239 秒", () => {
    const legs = [leg("TRTC", ["BL22", "BL21", "BL20"]), leg("TRTC", ["BL20", "BL21", "BL22"])];

    expect(tripMinutes(legs, { TRTC: times })).toBe(8 + TRANSFER_MINUTES);
  });

  it("有一段讀不到就不寫 不能少算一段", () => {
    const legs = [leg("TRTC", ["BL22", "BL21"]), leg("TYMC", ["A1", "A2"])];

    expect(tripMinutes(legs, { TRTC: times, TYMC: null })).toBeNull();
    expect(tripMinutes(legs, { TRTC: times })).toBeNull();
  });

  it("沒有路段時沒有時間", () => {
    expect(tripMinutes([], {})).toBeNull();
  });
});

describe("parseTravelTimes：欄位不同時", () => {
  it("只記欄位名稱 不帶值", () => {
    expect(parseTravelTimes([{ TrainType: 1, TravelTimes: [{ FromStationID: "A", RunTime: 10 }] }]).missing).toEqual(["TravelTimes[].ToStationID"]);
    expect(parseTravelTimes([{ TrainType: 1 }]).missing).toEqual(["TravelTimes"]);
  });
});

describe("legSchedule：照下一班推每一段大約幾點開 幾點到", () => {
  const clock = (time: string) => Date.parse(`2026-11-05T${time}:00+08:00`);

  it("第一段照開車時間加行駛時間 轉乘再加 5 分鐘", () => {
    expect(legSchedule(clock("08:00"), [600, 900])).toEqual([
      { departs: clock("08:00"), arrives: clock("08:10") },
      { departs: clock("08:15"), arrives: clock("08:30") },
    ]);
  });

  it("有一段不知道要坐多久 之後都不寫 寫錯的時間比不寫更糟", () => {
    expect(legSchedule(clock("08:00"), [600, null, 300])).toEqual([
      { departs: clock("08:00"), arrives: clock("08:10") },
      { departs: clock("08:15"), arrives: null },
      { departs: null, arrives: null },
    ]);
  });
});
