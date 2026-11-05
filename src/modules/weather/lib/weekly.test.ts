import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD_CITIES } from "./cities";
import { parseCityResults, parseCwaWeek, parseOpenMeteoWeek, parsePlaceChoice, wmoText } from "./weekly";

describe("wmoText：Open-Meteo 的天氣代碼換成中文", () => {
  it.each([[0, "晴"], [2, "多雲"], [3, "陰"], [45, "霧"], [61, "雨"], [80, "陣雨"], [71, "雪"], [95, "雷雨"]])("%i_%s", (code, text) => {
    expect(wmoText(code)).toBe(text);
  });

  it("認不得的代碼_空的 不亂猜", () => {
    expect(wmoText(999)).toBeNull();
  });
});

describe("parseOpenMeteoWeek", () => {
  it("每一天的天氣 高低溫與降雨機率 溫度四捨五入", () => {
    const json = { daily: { time: ["2026-11-05", "2026-11-06"], weather_code: [63, 0], temperature_2m_max: [22.7, 20.4], temperature_2m_min: [13.8, 13.3], precipitation_probability_max: [95, null] } };

    expect(parseOpenMeteoWeek(json)).toEqual([
      { date: "2026-11-05", weather: "雨", high: 23, low: 14, rain: 95 },
      { date: "2026-11-06", weather: "晴", high: 20, low: 13, rain: null },
    ]);
  });

  it("回應不對_空的", () => {
    expect(parseOpenMeteoWeek({ error: true })).toEqual([]);
  });
});

const element = (ElementName: string, key: string, values: [string, string][]) => ({ ElementName, Time: values.map(([StartTime, value]) => ({ StartTime, ElementValue: [{ [key]: value }] })) });
const cwa = (county: string) => ({
  records: {
    Locations: [
      {
        Location: [
          {
            LocationName: county,
            WeatherElement: [
              element("最高溫度", "MaxTemperature", [["2026-11-05T06:00:00+08:00", "24"], ["2026-11-05T18:00:00+08:00", "21"], ["2026-11-06T06:00:00+08:00", "25"]]),
              element("最低溫度", "MinTemperature", [["2026-11-05T06:00:00+08:00", "19"], ["2026-11-05T18:00:00+08:00", "17"], ["2026-11-06T06:00:00+08:00", "18"]]),
              element("12小時降雨機率", "ProbabilityOfPrecipitation", [["2026-11-05T06:00:00+08:00", "20"], ["2026-11-05T18:00:00+08:00", "60"], ["2026-11-06T06:00:00+08:00", "-"]]),
              element("天氣現象", "Weather", [["2026-11-05T06:00:00+08:00", "多雲"], ["2026-11-05T18:00:00+08:00", "短暫雨"], ["2026-11-06T06:00:00+08:00", "晴時多雲"]]),
            ],
          },
        ],
      },
    ],
  },
});

describe("parseCwaWeek：氣象署一週預報是每 12 小時一段 併成每一天", () => {
  it("高溫取最高 低溫取最低 降雨機率取最高 天氣用白天那一段", () => {
    expect(parseCwaWeek(cwa("臺北市"), "臺北市")).toEqual([
      { date: "2026-11-05", weather: "多雲", high: 24, low: 17, rain: 60 },
      { date: "2026-11-06", weather: "晴時多雲", high: 25, low: 18, rain: null },
    ]);
  });

  it("回應裡沒有這個縣市_空的", () => {
    expect(parseCwaWeek(cwa("臺北市"), "高雄市")).toEqual([]);
  });

  it("只有晚上那一段時用它的天氣 半夜看時今天白天已經過了", () => {
    const json = { records: { Locations: [{ Location: [{ LocationName: "臺北市", WeatherElement: [element("天氣現象", "Weather", [["2026-11-05T18:00:00+08:00", "陰"]])] }] }] } };

    expect(parseCwaWeek(json, "臺北市")[0].weather).toBe("陰");
  });
});

describe("parseCityResults：英文搜尋城市", () => {
  it("名稱寫出國家 同名的才分得出來", () => {
    const json = { results: [{ name: "Osaka", country: "Japan", country_code: "JP", latitude: 34.69, longitude: 135.5, timezone: "Asia/Tokyo" }] };

    expect(parseCityResults(json)).toEqual([{ name: "Osaka, Japan", country: "jp", latitude: 34.69, longitude: 135.5, timezone: "Asia/Tokyo" }]);
  });

  it("沒有結果_空的", () => {
    expect(parseCityResults({})).toEqual([]);
  });
});

describe("parsePlaceChoice：表單送來的地點", () => {
  const city = { kind: "world", name: "京都", country: "jp", latitude: 35, longitude: 135, timezone: "Asia/Tokyo" };

  it("縣市只收清單上的", () => {
    expect(parsePlaceChoice(JSON.stringify({ kind: "county", name: "臺北市" }))).toEqual({ ok: true, value: { kind: "county", name: "臺北市", country: null, latitude: null, longitude: null, timezone: null } });
    expect(parsePlaceChoice(JSON.stringify({ kind: "county", name: "火星市" })).ok).toBe(false);
  });

  it("國外城市要合理的座標與時區", () => {
    expect(parsePlaceChoice(JSON.stringify(city))).toEqual({ ok: true, value: city });
    expect(parsePlaceChoice(JSON.stringify({ ...city, latitude: 120 })).ok).toBe(false);
    expect(parsePlaceChoice(JSON.stringify({ ...city, longitude: "x" })).ok).toBe(false);
    expect(parsePlaceChoice(JSON.stringify({ ...city, timezone: "Asia/Tokyo&x=1" })).ok).toBe(false);
    expect(parsePlaceChoice(JSON.stringify({ ...city, name: "" })).ok).toBe(false);
    expect(parsePlaceChoice(JSON.stringify({ ...city, country: "../x" })).ok).toBe(false);
    expect(parsePlaceChoice(JSON.stringify({ ...city, name: "x".repeat(41) })).ok).toBe(false);
  });

  it("不是 JSON 的表單不會讓伺服器出錯", () => {
    expect(parsePlaceChoice("oops").ok).toBe(false);
  });

  it("內建的城市都過得了檢查 國旗的圖都在", () => {
    for (const place of WORLD_CITIES) {
      expect(parsePlaceChoice(JSON.stringify({ kind: "world", ...place })).ok, place.name).toBe(true);
      expect(existsSync(`public/images/flags/${place.country}.svg`), place.name).toBe(true);
    }
  });
});
