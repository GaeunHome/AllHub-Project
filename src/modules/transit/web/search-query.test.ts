import { describe, expect, it } from "vitest";
import { canSearch, parseSearch, searchHref } from "./search-query";

const TODAY = "2026-11-05";

describe("parseSearch：網址上的查詢條件", () => {
  it("沒有條件_預設高鐵與今天", () => {
    expect(parseSearch({}, TODAY)).toEqual({ mode: "thsr", system: "TRTC", line: "", direction: 0, from: "", to: "", date: TODAY });
  });

  it("帶了就照帶的", () => {
    expect(parseSearch({ mode: "tra", from: "1000", to: "1080", date: "2026-11-20" }, TODAY)).toMatchObject({ mode: "tra", from: "1000", to: "1080", date: "2026-11-20" });
  });

  it("不認得的交通工具與捷運系統_用預設", () => {
    expect(parseSearch({ mode: "plane", system: "MARS" }, TODAY)).toMatchObject({ mode: "thsr", system: "TRTC" });
  });

  it("車站代碼會放進 TDX 的網址 不合格的當作沒選", () => {
    expect(parseSearch({ from: "../admin", to: "1000' or 1=1" }, TODAY)).toMatchObject({ from: "", to: "" });
  });

  it.each([["2026-02-30"], ["2026-11-04"], ["2027-06-01"], ["明天"]])("日期 %s 不能查_用今天", (date) => {
    expect(parseSearch({ date }, TODAY).date).toBe(TODAY);
  });

  it("同一個參數出現兩次_當作沒帶", () => {
    expect(parseSearch({ mode: ["tra", "thsr"] }, TODAY).mode).toBe("thsr");
  });
});

describe("searchHref", () => {
  it("高鐵與台鐵帶日期 不帶捷運系統", () => {
    expect(searchHref({ mode: "tra", system: "TRTC", line: "", direction: 0, from: "1000", to: "1080", date: TODAY })).toBe(`/transit?mode=tra&from=1000&to=1080&date=${TODAY}`);
  });

  it("捷運帶系統 不帶日期 時刻表只看今天", () => {
    expect(searchHref({ mode: "metro", system: "KRTC", line: "", direction: 0, from: "R10", to: "", date: TODAY })).toBe("/transit?mode=metro&system=KRTC&from=R10");
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
    expect(searchHref({ mode: "bus", system: "Taipei", line: "307", direction: 1, from: "", to: "", date: TODAY })).toBe("/transit?mode=bus&system=Taipei&line=307&dir=1");
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
