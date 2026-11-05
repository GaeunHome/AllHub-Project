import { describe, expect, it } from "vitest";
import { canSearch, closedHref, parseSearch, searchHref, trainsAfter } from "../search-query";

const TODAY = "2026-11-05";

describe("parseSearch：網址上的查詢條件", () => {
  it("沒有條件_預設高鐵與今天", () => {
    expect(parseSearch({}, TODAY)).toEqual({ mode: "thsr", system: "TRTC", line: "", direction: 0, from: "", to: "", date: TODAY, time: "" });
  });

  it("帶了就照帶的", () => {
    expect(parseSearch({ mode: "tra", from: "1000", to: "1080", date: "2026-11-20" }, TODAY)).toMatchObject({ mode: "tra", from: "1000", to: "1080", date: "2026-11-20" });
  });

  it("不認得的交通工具與捷運系統_用預設", () => {
    expect(parseSearch({ mode: "plane", system: "MARS" }, TODAY)).toMatchObject({ mode: "thsr", system: "TRTC" });
  });

  it("捷運只有臺北捷運、環狀線與機場捷運_其他系統用預設", () => {
    expect(parseSearch({ mode: "metro", system: "KRTC" }, TODAY).system).toBe("TRTC");
    expect(parseSearch({ mode: "metro", system: "TYMC" }, TODAY).system).toBe("TYMC");
    expect(parseSearch({ mode: "metro", system: "NTMC" }, TODAY).system).toBe("NTMC");
  });

  it("車站代碼會放進 TDX 的網址 不合格的當作沒選", () => {
    expect(parseSearch({ from: "../admin", to: "1000' or 1=1" }, TODAY)).toMatchObject({ from: "", to: "" });
  });

  it.each([["2026-02-30"], ["2026-11-04"], ["2027-06-01"], ["明天"]])("日期 %s 不能查_用今天", (date) => {
    expect(parseSearch({ date }, TODAY).date).toBe(TODAY);
  });

  it("出發時間帶了就照帶的", () => {
    expect(parseSearch({ time: "17:30" }, TODAY).time).toBe("17:30");
  });

  it.each([["25:00"], ["17:60"], ["7:30"], ["明天"]])("出發時間 %s 不是時間_當作沒選", (time) => {
    expect(parseSearch({ time }, TODAY).time).toBe("");
  });

  it("同一個參數出現兩次_當作沒帶", () => {
    expect(parseSearch({ mode: ["tra", "thsr"] }, TODAY).mode).toBe("thsr");
  });
});

describe("searchHref", () => {
  it("高鐵與台鐵帶日期 不帶捷運系統", () => {
    expect(searchHref({ mode: "tra", system: "TRTC", line: "", direction: 0, from: "1000", to: "1080", date: TODAY, time: "" })).toBe(`/transit?mode=tra&from=1000&to=1080&date=${TODAY}`);
  });

  it("捷運帶系統 不帶日期 時刻表只看今天", () => {
    expect(searchHref({ mode: "metro", system: "TYMC", line: "", direction: 0, from: "R10", to: "", date: TODAY, time: "" })).toBe("/transit?mode=metro&system=TYMC&from=R10");
  });
});

describe("公車的查詢", () => {
  it("帶縣市 路線與方向", () => {
    expect(parseSearch({ mode: "bus", system: "Kaohsiung", line: "紅30", dir: "1" }, TODAY)).toMatchObject({ mode: "bus", system: "Kaohsiung", line: "紅30", direction: 1 });
  });

  it("不認得的縣市用臺北 路線有引號當作沒填", () => {
    expect(parseSearch({ mode: "bus", system: "Mars", line: "307' or 1=1" }, TODAY)).toMatchObject({ system: "Taipei", line: "" });
  });

  it("網址只帶公車用得到的", () => {
    expect(searchHref({ mode: "bus", system: "Taipei", line: "307", direction: 1, from: "", to: "", date: TODAY, time: "" })).toBe("/transit?mode=bus&system=Taipei&line=307&dir=1");
  });

  it("填了路線才查", () => {
    expect(canSearch({ mode: "bus", line: "307", from: "", to: "" })).toBe(true);
    expect(canSearch({ mode: "bus", line: "", from: "", to: "" })).toBe(false);
  });
});

describe("canSearch：起訖都選了才向 TDX 查", () => {
  it.each([
    ["1000", "1080", true],
    ["1000", "", false],
    ["", "1080", false],
    ["1000", "1000", false],
  ])("%s 到 %s_%s", (from, to, expected) => {
    expect(canSearch({ mode: "tra", line: "", from, to })).toBe(expected);
  });
});

describe("searchHref 的出發時間", () => {
  const query = { mode: "tra" as const, system: "TRTC", line: "", direction: 0, from: "1000", to: "1080", date: TODAY, time: "17:30" };

  it("高鐵與台鐵帶出發時間", () => {
    expect(searchHref(query)).toBe(`/transit?mode=tra&from=1000&to=1080&date=${TODAY}&time=17%3A30`);
  });

  it("再讀一次網址時間還在", () => {
    expect(parseSearch(Object.fromEntries(new URL(searchHref(query), "http://x").searchParams), TODAY).time).toBe("17:30");
  });
});

describe("closedHref：關閉查詢結果", () => {
  const rail = { mode: "tra" as const, system: "TRTC", line: "", direction: 0, from: "1000", to: "1080", date: TODAY, time: "" };

  it("拿掉迄站後不再查詢，起站與日期留著", () => {
    const next = parseSearch(Object.fromEntries(new URL(closedHref(rail), "http://x").searchParams), TODAY);

    expect(canSearch(next)).toBe(false);
    expect(next).toMatchObject({ mode: "tra", from: "1000", date: TODAY });
  });

  it("公車拿掉路線後不再查詢，縣市留著", () => {
    const next = parseSearch(Object.fromEntries(new URL(closedHref({ ...rail, mode: "bus", system: "Tainan", line: "307" }), "http://x").searchParams), TODAY);

    expect(canSearch(next)).toBe(false);
    expect(next.system).toBe("Tainan");
  });
});

describe("trainsAfter：查詢結果列哪些班次", () => {
  const at = (clock: string) => Date.parse(`${TODAY}T${clock}:00+08:00`);
  const train = (clock: string) => ({ at: at(clock), arrivesAt: null, trainNo: clock, kind: null, toward: null });
  const trains = [train("08:00"), train("12:00"), train("17:30"), train("20:00")];
  const clocks = (time: string, now: number) => trainsAfter(trains, { date: TODAY, time, now }).map((departure) => departure.trainNo);

  it("沒選時間_列出還沒開的", () => {
    expect(clocks("", at("10:00"))).toEqual(["12:00", "17:30", "20:00"]);
  });

  it("選了時間_從那個時間開始，剛好那一分開的也算", () => {
    expect(clocks("17:30", at("10:00"))).toEqual(["17:30", "20:00"]);
  });

  it("選的時間比現在早_開走的還是不列", () => {
    expect(clocks("09:00", at("10:00"))).toEqual(["12:00", "17:30", "20:00"]);
  });
});
