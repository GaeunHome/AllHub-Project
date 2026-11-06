import { describe, expect, it } from "vitest";
import { fromToday, parseCwaHours, parseCwaWeek, parseOpenMeteoHours, parseOpenMeteoWeek, upcomingHours, wmoText } from "../weekly";

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

describe("parseOpenMeteoHours：國外的每小時", () => {
  const json = {
    utc_offset_seconds: 32400,
    hourly: {
      time: ["2026-11-07T14:00", "2026-11-07T15:00"],
      temperature_2m: [18.4, null],
      precipitation_probability: [30, 80],
      weather_code: [61, 999],
    },
  };

  it("時間是當地時間 溫度四捨五入 讀不到的欄位留空 不亂猜", () => {
    expect(parseOpenMeteoHours(json)).toEqual({
      utcOffsetSeconds: 32400,
      hours: [
        { time: "2026-11-07T14:00", temperature: 18, rain: 30, weather: "雨" },
        { time: "2026-11-07T15:00", temperature: null, rain: 80, weather: null },
      ],
    });
  });

  it("格式不對_空的 一週預報照常顯示", () => {
    expect(parseOpenMeteoHours({ error: true })).toEqual({ utcOffsetSeconds: 0, hours: [] });
  });
});

describe("parseCwaHours：氣象署三天的預報", () => {
  const hourly = (county: string) => ({
    records: {
      Locations: [
        {
          Location: [
            {
              LocationName: county,
              WeatherElement: [
                { ElementName: "溫度", Time: [{ DataTime: "2026-11-07T18:00:00+08:00", ElementValue: [{ Temperature: "23" }] }, { DataTime: "2026-11-07T20:00:00+08:00", ElementValue: [{ Temperature: "22" }] }, { DataTime: "2026-11-07T21:00:00+08:00", ElementValue: [{ Temperature: "21" }] }] },
                { ElementName: "3小時降雨機率", Time: [{ StartTime: "2026-11-07T18:00:00+08:00", EndTime: "2026-11-07T21:00:00+08:00", ElementValue: [{ ProbabilityOfPrecipitation: "40" }] }] },
                { ElementName: "天氣現象", Time: [{ StartTime: "2026-11-07T18:00:00+08:00", EndTime: "2026-11-07T21:00:00+08:00", ElementValue: [{ Weather: "短暫雨" }] }] },
              ],
            },
          ],
        },
      ],
    },
  });

  it("每個溫度的時間點 找涵蓋它的那一段降雨機率與天氣 21:00 已經是下一段了", () => {
    expect(parseCwaHours(hourly("臺北市"), "臺北市")).toEqual([
      { time: "2026-11-07T18:00", temperature: 23, rain: 40, weather: "短暫雨" },
      { time: "2026-11-07T20:00", temperature: 22, rain: 40, weather: "短暫雨" },
      { time: "2026-11-07T21:00", temperature: 21, rain: null, weather: null },
    ]);
  });

  it("回應裡沒有這個縣市_空的", () => {
    expect(parseCwaHours(hourly("臺北市"), "高雄市")).toEqual([]);
  });
});

describe("upcomingHours：今天過去的小時不用列", () => {
  const point = (time: string) => ({ time, temperature: 20, rain: null, weather: null });
  const now = new Date("2026-11-07T06:30:00Z");

  it("台北 14:30 時 14:00 這一格還在 13:00 不算", () => {
    expect(upcomingHours([point("2026-11-07T13:00"), point("2026-11-07T14:00"), point("2026-11-08T01:00")], now, 8 * 3600).map(({ time }) => time)).toEqual(["2026-11-07T14:00", "2026-11-08T01:00"]);
  });

  it("國外照當地時間算：同一刻東京已經 15 點", () => {
    expect(upcomingHours([point("2026-11-07T14:00"), point("2026-11-07T15:00")], now, 9 * 3600).map(({ time }) => time)).toEqual(["2026-11-07T15:00"]);
  });
});

describe("fromToday：一週從當地的今天算", () => {
  const days = [{ date: "2026-11-06" }, { date: "2026-11-07" }, { date: "2026-11-08" }].map((day) => ({ ...day, weather: "晴", high: 25, low: 18, rain: 10 }));
  const dates = (now: string, offsetHours: number) => fromToday(days, new Date(now), offsetHours * 3600).map(({ date }) => date);

  it("台北 11/7 03:20 昨晚那一段不算", () => {
    expect(dates("2026-11-06T19:20:00Z", 8)).toEqual(["2026-11-07", "2026-11-08"]);
  });

  it("同一個瞬間洛杉磯還是 11/6 那天要留著", () => {
    expect(dates("2026-11-06T19:20:00Z", -8)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
  });
});
