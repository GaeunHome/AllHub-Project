import { describe, expect, it } from "vitest";
import { isBusLine, parseBusEta, parseBusRoute, parseBusSchedule, soonestEta } from "../bus";

const stops = (...names: string[]) => names.map((name, index) => ({ StopUID: `TPE${index}`, StopName: { Zh_tw: name }, StopSequence: index + 1 }));

describe("parseBusRoute：路線的兩個方向與站牌", () => {
  it("每個方向一組 名稱是最後一站", () => {
    const rows = [{ Direction: 0, Stops: stops("板橋", "西門", "台北車站") }, { Direction: 1, Stops: stops("台北車站", "西門", "板橋") }];

    expect(parseBusRoute(rows).map(({ direction, name }) => [direction, name])).toEqual([[0, "台北車站"], [1, "板橋"]]);
  });

  it("同方向有區間車時留站最多的主線", () => {
    const rows = [{ Direction: 0, Stops: stops("板橋", "西門") }, { Direction: 0, Stops: stops("板橋", "西門", "台北車站") }];

    expect(parseBusRoute(rows)[0].stops).toHaveLength(3);
  });

  it("站序照 StopSequence 不照陣列順序", () => {
    const rows = [{ Direction: 0, Stops: [{ StopUID: "b", StopName: { Zh_tw: "第二站" }, StopSequence: 2 }, { StopUID: "a", StopName: { Zh_tw: "第一站" }, StopSequence: 1 }] }];

    expect(parseBusRoute(rows)[0].stops.map((stop) => stop.id)).toEqual(["a", "b"]);
  });

  it("查不到路線_空的", () => {
    expect(parseBusRoute([])).toEqual([]);
  });
});

const eta = (stop: string, direction: number, estimate: number | null, status = 0) => ({ StopUID: stop, Direction: direction, EstimateTime: estimate, StopStatus: status });

describe("parseBusEta：每一站還有幾秒", () => {
  it("EstimateTime 單位是秒 只看選的方向", () => {
    expect(parseBusEta([eta("A", 0, 200), eta("A", 1, 30)], 0)).toEqual({ A: { seconds: 200, status: null } });
  });

  it("同一站有好幾台車_取最快的", () => {
    expect(parseBusEta([eta("A", 0, 500), eta("A", 0, 120)], 0).A.seconds).toBe(120);
  });

  it.each([[1, "尚未發車"], [2, "交管不停靠"], [3, "末班車已過"], [4, "今日未營運"]])("沒有時間時寫出狀態 %i_%s", (status, text) => {
    expect(parseBusEta([eta("A", 0, null, status)], 0).A).toEqual({ seconds: null, status: text });
  });

  it("尚未發車但有預估_還是要倒數 部分縣市會這樣給", () => {
    expect(parseBusEta([eta("A", 0, 600, 1)], 0).A).toEqual({ seconds: 600, status: null });
  });

  it("其中一台有時間 另一台沒有_用有時間的", () => {
    expect(parseBusEta([eta("A", 0, null, 1), eta("A", 0, 90)], 0).A.seconds).toBe(90);
  });
});

describe("soonestEta：追蹤的那一站", () => {
  it("回這一站的預估 沒有資料時是空的", () => {
    expect(soonestEta([eta("A", 0, 90)], "A", 0)).toEqual({ seconds: 90, status: null });
    expect(soonestEta([], "A", 0)).toEqual({ seconds: null, status: null });
  });
});

const EVERY_DAY = { Sunday: 1, Monday: 1, Tuesday: 1, Wednesday: 1, Thursday: 1, Friday: 1, Saturday: 1 };
const WEEKEND = { Sunday: 1, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 1 };
const DATE = "2026-11-05"; // 星期四
const clock = (hour: number, minute = 0) => hour * 60 + minute;

describe("parseBusSchedule：班距與班表", () => {
  it("現在這個時段的班距", () => {
    const rows = [{ Direction: 0, Frequencys: [{ StartTime: "06:00", EndTime: "09:00", MinHeadwayMins: 5, MaxHeadwayMins: 8, ServiceDay: EVERY_DAY }, { StartTime: "09:00", EndTime: "17:00", MinHeadwayMins: 10, MaxHeadwayMins: 15, ServiceDay: EVERY_DAY }] }];

    expect(parseBusSchedule(rows, 0, DATE, clock(8)).headway).toEqual({ min: 5, max: 8 });
    expect(parseBusSchedule(rows, 0, DATE, clock(10)).headway).toEqual({ min: 10, max: 15 });
  });

  it("不是今天營運的班距不算", () => {
    const rows = [{ Direction: 0, Frequencys: [{ StartTime: "06:00", EndTime: "23:00", MinHeadwayMins: 20, MaxHeadwayMins: 30, ServiceDay: WEEKEND }] }];

    expect(parseBusSchedule(rows, 0, DATE, clock(8)).headway).toBeNull();
  });

  it("班次少的路線用班表 列出之後的發車時間", () => {
    const trip = (time: string) => ({ ServiceDay: EVERY_DAY, StopTimes: [{ StopSequence: 1, DepartureTime: time }] });
    const rows = [{ Direction: 0, Timetables: [trip("07:00"), trip("09:30"), trip("08:10")] }];

    expect(parseBusSchedule(rows, 0, DATE, clock(8)).departures).toEqual(["08:10", "09:30"]);
  });

  it("只看選的方向", () => {
    const rows = [{ Direction: 1, Frequencys: [{ StartTime: "06:00", EndTime: "23:00", MinHeadwayMins: 5, MaxHeadwayMins: 8, ServiceDay: EVERY_DAY }] }];

    expect(parseBusSchedule(rows, 0, DATE, clock(8)).headway).toBeNull();
  });
});

describe("isBusLine：路線名稱會放進 TDX 的網址與查詢條件", () => {
  it.each([["307"], ["紅30"], ["藍12"], ["承德幹線"], ["中山幹線(夜)"], ["235-區"]])("%s 收", (line) => {
    expect(isBusLine(line)).toBe(true);
  });

  it.each([[""], ["307' or 1=1"], ["a/b"], ["x".repeat(21)]])("%s 不收", (line) => {
    expect(isBusLine(line)).toBe(false);
  });
});
