import { describe, expect, it } from "vitest";
import { aqiLevel, countyAqi, parseStations } from "./aqi";
import { normalizeCounty } from "./counties";
import { parseCwaTime, parseForecast, periodLabel, upcomingPeriods } from "./forecast";

// 照氣象署 F-C0032-001 的回應格式手寫 時間有新舊兩種寫法
const slot = (startTime: string, endTime: string, parameterName: string, parameterUnit?: string) => ({ startTime, endTime, parameter: { parameterName, ...(parameterUnit ? { parameterUnit } : {}) } });
const element = (elementName: string, values: [string, string, string, string?][]) => ({ elementName, time: values.map(([start, end, name, unit]) => slot(start, end, name, unit)) });
const SLOTS: [string, string][] = [
  ["2026-10-16T18:00:00+08:00", "2026-10-17T06:00:00+08:00"],
  ["2026-10-17T06:00:00+08:00", "2026-10-17T18:00:00+08:00"],
  ["2026-10-17T18:00:00+08:00", "2026-10-18T06:00:00+08:00"],
];
const RESPONSE = {
  success: "true",
  records: {
    datasetDescription: "三十六小時天氣預報",
    location: [
      { locationName: "新北市", weatherElement: [element("Wx", [[...SLOTS[0], "晴時多雲"]])] },
      {
        locationName: "臺北市",
        weatherElement: [
          element("Wx", SLOTS.map(([s, e], i) => [s, e, ["多雲時陰", "多雲午後短暫雷陣雨", "陰短暫雨"][i]])),
          element("PoP", SLOTS.map(([s, e], i) => [s, e, ["20", "60", "70"][i], "百分比"])),
          element("MinT", SLOTS.map(([s, e], i) => [s, e, ["24", "25", "23"][i], "C"])),
          element("CI", SLOTS.map(([s, e], i) => [s, e, ["舒適", "悶熱", "舒適"][i]])),
          element("MaxT", SLOTS.map(([s, e], i) => [s, e, ["27", "31", "26"][i], "C"])),
        ],
      },
    ],
  },
};

describe("縣市", () => {
  it("「台」換成「臺」才對得上氣象署與環境部的資料；不在 22 個縣市裡的是 null", () => {
    expect(normalizeCounty(" 台北市 ")).toBe("臺北市");
    expect(normalizeCounty("臺東縣")).toBe("臺東縣");
    expect(normalizeCounty("台灣")).toBeNull();
    expect(normalizeCounty("")).toBeNull();
  });
});

describe("氣象署的 36 小時預報", () => {
  it("時間：舊的「2026-10-16 18:00:00」與新的 ISO 寫法都當成台北時間", () => {
    expect(parseCwaTime("2026-10-16 18:00:00")).toBe("2026-10-16T10:00:00.000Z");
    expect(parseCwaTime("2026-10-16T18:00:00+08:00")).toBe("2026-10-16T10:00:00.000Z");
    expect(parseCwaTime("不是時間")).toBeNull();
  });

  it("只取指定的縣市，三個時段的天氣、降雨機率、溫度與舒適度照開始時間對齊", () => {
    const { forecast, missing } = parseForecast(RESPONSE, "臺北市");

    expect(missing).toEqual([]);
    expect(forecast?.periods).toEqual([
      { start: "2026-10-16T10:00:00.000Z", end: "2026-10-16T22:00:00.000Z", description: "多雲時陰", rain: 20, minTemp: 24, maxTemp: 27, comfort: "舒適" },
      { start: "2026-10-16T22:00:00.000Z", end: "2026-10-17T10:00:00.000Z", description: "多雲午後短暫雷陣雨", rain: 60, minTemp: 25, maxTemp: 31, comfort: "悶熱" },
      { start: "2026-10-17T10:00:00.000Z", end: "2026-10-17T22:00:00.000Z", description: "陰短暫雨", rain: 70, minTemp: 23, maxTemp: 26, comfort: "舒適" },
    ]);
  });

  it("回應的縣市名稱寫「台」（例如台北市）也對得上選的臺北市", () => {
    const location = RESPONSE.records.location[1];
    const { forecast } = parseForecast({ records: { location: [{ ...location, locationName: "台北市" }] } }, "臺北市");

    expect(forecast).toMatchObject({ county: "臺北市", periods: [{ description: "多雲時陰" }, { description: "多雲午後短暫雷陣雨" }, { description: "陰短暫雨" }] });
  });

  it("少了要素時照樣顯示有的，並記下缺少的欄位名稱；找不到縣市或沒有天氣現象是 null", () => {
    const partial = parseForecast(RESPONSE, "新北市");
    expect(partial.forecast?.periods).toEqual([{ start: "2026-10-16T10:00:00.000Z", end: "2026-10-16T22:00:00.000Z", description: "晴時多雲", rain: null, minTemp: null, maxTemp: null, comfort: null }]);
    expect(partial.missing).toEqual(["PoP", "MinT", "MaxT", "CI"]);

    expect(parseForecast(RESPONSE, "高雄市")).toEqual({ forecast: null, missing: ["records.location"] });
    expect(parseForecast({ records: { location: [{ locationName: "高雄市", weatherElement: [] }] } }, "高雄市").forecast).toBeNull();
    expect(parseForecast("壞掉的回應", "臺北市").forecast).toBeNull();
  });

  it("已經結束的時段不算：晚上 10 點以後，第一個是明天白天", () => {
    const { forecast } = parseForecast(RESPONSE, "臺北市");
    expect(upcomingPeriods(forecast!, new Date("2026-10-16T22:30:00.000Z")).map((period) => period.description)).toEqual(["多雲午後短暫雷陣雨", "陰短暫雨"]);
  });
});

describe("時段的說法（卡片與早上的通知共用）", () => {
  it("早上 6 點多看：06:00 起的是今天白天、18:00 起的是今晚、隔天 06:00 起的是明天白天", () => {
    const morning = new Date("2026-10-18T22:10:00.000Z");

    expect(["2026-10-18T22:00:00.000Z", "2026-10-19T10:00:00.000Z", "2026-10-19T22:00:00.000Z"].map((start) => periodLabel(new Date(start), morning))).toEqual(["今天白天", "今晚", "明天白天"]);
  });

  it("晚上 11 點看：18:00 起的還是今晚，接著是明天白天、明晚，再遠的寫日期", () => {
    const night = new Date("2026-10-19T15:00:00.000Z");

    expect(["2026-10-19T10:00:00.000Z", "2026-10-19T22:00:00.000Z", "2026-10-20T10:00:00.000Z", "2026-10-20T22:00:00.000Z"].map((start) => periodLabel(new Date(start), night))).toEqual(["今晚", "明天白天", "明晚", "10/21 白天"]);
  });

  it("過了午夜的凌晨 1 點看：前一天 18:00 開始、早上 6 點才結束的那段還是今晚（不寫 10/18 晚上），接著是今天白天", () => {
    const midnight = new Date("2026-10-18T17:00:00.000Z");

    expect(["2026-10-18T10:00:00.000Z", "2026-10-18T22:00:00.000Z"].map((start) => periodLabel(new Date(start), midnight))).toEqual(["今晚", "今天白天"]);
  });
});

describe("環境部的空氣品質", () => {
  it("分級照環境部公告：0–50 良好、51–100 普通、101–150 對敏感族群不健康、151–200 對所有族群不健康、201–300 非常不健康、301 以上危害", () => {
    expect([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiLevel)).toEqual([
      "良好",
      "良好",
      "普通",
      "普通",
      "對敏感族群不健康",
      "對敏感族群不健康",
      "對所有族群不健康",
      "對所有族群不健康",
      "非常不健康",
      "非常不健康",
      "危害",
    ]);
  });

  it("一個縣市有好幾個測站時照最差的那一個；維修中（AQI 是空的）的測站略過", () => {
    const { stations } = parseStations({
      records: [
        { sitename: "士林", county: "臺北市", aqi: "35", publishtime: "2026/10/16 15:00:00" },
        { sitename: "萬華", county: "臺北市", aqi: "78", publishtime: "2026/10/16 15:00:00" },
        { sitename: "松山", county: "臺北市", aqi: "", publishtime: "2026/10/16 15:00:00" },
        { sitename: "板橋", county: "新北市", aqi: "120", publishtime: "2026/10/16 15:00:00" },
      ],
    });

    expect(countyAqi(stations, "臺北市")).toEqual({ county: "臺北市", site: "萬華", aqi: 78, publishedAt: "2026/10/16 15:00:00", level: "普通", sites: 2 });
    expect(countyAqi(stations, "新北市")).toMatchObject({ aqi: 120, level: "對敏感族群不健康", sites: 1 });
    expect(countyAqi(stations, "連江縣")).toBeNull();
  });

  it("欄位都對不上時記下欄位名稱，不是 records 的回應整個讀不到", () => {
    expect(parseStations({ records: [{ SiteName: "士林", AQI: "35" }] })).toEqual({ stations: [], missing: ["records[].county", "records[].aqi", "records[].sitename"] });
    expect(parseStations({ error: "invalid api_key" })).toEqual({ stations: [], missing: ["records"] });
  });
});
