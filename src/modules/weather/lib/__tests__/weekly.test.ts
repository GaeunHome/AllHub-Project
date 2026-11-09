import { describe, expect, it } from "vitest";
import { NO_DETAILS, hourPoint } from "../../dev/fixtures";
import { fromToday, nextDayHours, parseCwaHours, parseCwaWeek, parseOpenMeteoHours, parseOpenMeteoWeek, upcomingHours, wmoText } from "../weekly";

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
      { date: "2026-11-05", weather: "雨", high: 23, low: 14, rain: 95, details: NO_DETAILS },
      { date: "2026-11-06", weather: "晴", high: 20, low: 13, rain: null, details: NO_DETAILS },
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
      { date: "2026-11-05", weather: "多雲", high: 24, low: 17, rain: 60, details: NO_DETAILS },
      { date: "2026-11-06", weather: "晴時多雲", high: 25, low: 18, rain: null, details: NO_DETAILS },
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
      apparent_temperature: [17.6, null],
      relative_humidity_2m: [70, 82],
      uv_index: [2.6, 0],
    },
  };

  it("時間是當地時間 溫度四捨五入 讀不到的欄位留空 不亂猜", () => {
    expect(parseOpenMeteoHours(json)).toEqual({
      utcOffsetSeconds: 32400,
      hours: [
        { time: "2026-11-07T14:00", temperature: 18, rain: 30, weather: "雨", feels: 18, humidity: 70, uv: 3 },
        { time: "2026-11-07T15:00", temperature: null, rain: 80, weather: null, feels: null, humidity: 82, uv: 0 },
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
                { ElementName: "體感溫度", Time: [{ DataTime: "2026-11-07T18:00:00+08:00", ElementValue: [{ ApparentTemperature: "25" }] }, { DataTime: "2026-11-07T21:00:00+08:00", ElementValue: [{ ApparentTemperature: "22" }] }] },
                { ElementName: "相對濕度", Time: [{ DataTime: "2026-11-07T18:00:00+08:00", ElementValue: [{ RelativeHumidity: "74" }] }, { DataTime: "2026-11-07T20:00:00+08:00", ElementValue: [{ RelativeHumidity: "80" }] }] },
              ],
            },
          ],
        },
      ],
    },
  });

  it("每個溫度的時間點 找涵蓋它的那一段降雨機率與天氣 21:00 已經是下一段了；體感與濕度照同一個時間點，沒有那一點的留空；氣象署沒有每小時的紫外線", () => {
    expect(parseCwaHours(hourly("臺北市"), "臺北市")).toEqual([
      { time: "2026-11-07T18:00", temperature: 23, rain: 40, weather: "短暫雨", feels: 25, humidity: 74, uv: null },
      { time: "2026-11-07T20:00", temperature: 22, rain: 40, weather: "短暫雨", feels: null, humidity: 80, uv: null },
      { time: "2026-11-07T21:00", temperature: 21, rain: null, weather: null, feels: 22, humidity: null, uv: null },
    ]);
  });

  it("回應裡沒有這個縣市_空的", () => {
    expect(parseCwaHours(hourly("臺北市"), "高雄市")).toEqual([]);
  });
});

describe("upcomingHours：今天過去的小時不用列", () => {
  const point = (time: string) => hourPoint(time, { temperature: 20 });
  const now = new Date("2026-11-07T06:30:00Z");

  it("台北 14:30 時 14:00 這一格還在 13:00 不算", () => {
    expect(upcomingHours([point("2026-11-07T13:00"), point("2026-11-07T14:00"), point("2026-11-08T01:00")], now, 8 * 3600).map(({ time }) => time)).toEqual(["2026-11-07T14:00", "2026-11-08T01:00"]);
  });

  it("國外照當地時間算：同一刻東京已經 15 點", () => {
    expect(upcomingHours([point("2026-11-07T14:00"), point("2026-11-07T15:00")], now, 9 * 3600).map(({ time }) => time)).toEqual(["2026-11-07T15:00"]);
  });
});

describe("fromToday：一週從當地的今天算", () => {
  const days = [{ date: "2026-11-06" }, { date: "2026-11-07" }, { date: "2026-11-08" }].map((day) => ({ ...day, weather: "晴", high: 25, low: 18, rain: 10, details: NO_DETAILS }));
  const dates = (now: string, offsetHours: number) => fromToday(days, new Date(now), offsetHours * 3600).map(({ date }) => date);

  it("台北 11/7 03:20 昨晚那一段不算", () => {
    expect(dates("2026-11-06T19:20:00Z", 8)).toEqual(["2026-11-07", "2026-11-08"]);
  });

  it("同一個瞬間洛杉磯還是 11/6 那天要留著", () => {
    expect(dates("2026-11-06T19:20:00Z", -8)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
  });
});

describe("今天的細節：國外跟一週預報同一個 Open-Meteo 回應", () => {
  const json = {
    hourly: { time: ["2026-11-07T00:00", "2026-11-07T12:00", "2026-11-08T00:00"], relative_humidity_2m: [80, 61, 90], dew_point_2m: [10.2, 12.8, 14] },
    daily: {
      time: ["2026-11-07", "2026-11-08"],
      weather_code: [1, 3],
      temperature_2m_max: [19.6, 17.2],
      temperature_2m_min: [12.2, 11.4],
      precipitation_probability_max: [10, 40],
      apparent_temperature_max: [18.6, null],
      apparent_temperature_min: [10.4, null],
      wind_speed_10m_max: [4.2, null],
      wind_direction_10m_dominant: [48, null],
      wind_gusts_10m_max: [9.1, null],
      uv_index_max: [3.55, null],
      sunrise: ["2026-11-07T06:05", null],
      sunset: ["2026-11-07T16:38", null],
    },
  };

  it("體感是當天最高與最低 濕度與露點是當天每小時的平均 風是最大風速的級數、風速與主要風向 陣風是最大陣風的級數 紫外線四捨五入 日出日落是當地時間 沒有舒適度", () => {
    expect(parseOpenMeteoWeek(json)[0].details).toEqual({
      feelsHigh: 19,
      feelsLow: 10,
      humidity: 71,
      dewPoint: 12,
      comfort: null,
      wind: { direction: "東北風", level: 3, speed: 4.2, gust: 5 },
      uv: 4,
      sunrise: "06:05",
      sunset: "16:38",
    });
  });

  it("讀不到的欄位留空 不亂猜", () => {
    expect(parseOpenMeteoWeek(json)[1].details).toEqual({ ...NO_DETAILS, humidity: 90, dewPoint: 14 });
  });
});

describe("今天的細節：台灣用同一份 F-D0047-091", () => {
  const MORNING = "2026-11-07T06:00:00+08:00";
  const NIGHT = "2026-11-07T18:00:00+08:00";
  const values = (ElementName: string, rows: [string, Record<string, string>][]) => ({ ElementName, Time: rows.map(([StartTime, value]) => ({ StartTime, EndTime: StartTime, ElementValue: [value] })) });
  const week = (...elements: unknown[]) => ({ records: { Locations: [{ Location: [{ LocationName: "臺北市", WeatherElement: elements }] }] } });
  const weather = element("天氣現象", "Weather", [[MORNING, "多雲"], [NIGHT, "陰"]]);
  const full = week(
    weather,
    element("最高體感溫度", "MaxApparentTemperature", [[MORNING, "27"], [NIGHT, "23"]]),
    element("最低體感溫度", "MinApparentTemperature", [[MORNING, "22"], [NIGHT, "19"]]),
    element("平均相對濕度", "RelativeHumidity", [[MORNING, "70"], [NIGHT, "85"]]),
    values("風速", [[MORNING, { WindSpeed: "5", BeaufortScale: "3" }], [NIGHT, { WindSpeed: "2", BeaufortScale: "2" }]]),
    element("風向", "WindDirection", [[MORNING, "東北風"], [NIGHT, "偏北風"]]),
    values("紫外線指數", [[MORNING, { UVIndex: "6", UVExposureLevel: "高量級" }]]),
    element("平均露點溫度", "DewPoint", [[MORNING, "16"], [NIGHT, "19"]]),
    values("最大舒適度指數", [[MORNING, { MaxComfortIndex: "26", MaxComfortIndexDescription: "舒適" }], [NIGHT, { MaxComfortIndex: "24", MaxComfortIndexDescription: "舒適" }]]),
    values("最小舒適度指數", [[MORNING, { MinComfortIndex: "20", MinComfortIndexDescription: "舒適" }], [NIGHT, { MinComfortIndex: "15", MinComfortIndexDescription: "稍有寒意" }]]),
  );

  it("體感取兩段裡最高與最低 濕度與露點是兩段的平均 舒適度從指數最低的那段寫到最高的那段 風看白天那一段 紫外線只有白天 一週預報沒有日出日落與陣風", () => {
    expect(parseCwaWeek(full, "臺北市")[0].details).toEqual({
      feelsHigh: 27,
      feelsLow: 19,
      humidity: 78,
      dewPoint: 18,
      comfort: "稍有寒意到舒適",
      wind: { direction: "東北風", level: 3, speed: 5, gust: null },
      uv: 6,
      sunrise: null,
      sunset: null,
    });
  });

  it("晚上看時今天只剩晚上那一段：風看那一段 晚上沒有紫外線", () => {
    const night = week(element("天氣現象", "Weather", [[NIGHT, "陰"]]), values("風速", [[NIGHT, { WindSpeed: "2", BeaufortScale: "2" }]]), element("風向", "WindDirection", [[NIGHT, "偏北風"]]));

    expect(parseCwaWeek(night, "臺北市")[0].details).toEqual({ ...NO_DETAILS, wind: { direction: "偏北風", level: 2, speed: 2, gust: null } });
  });

  it("級數讀不到時照風速換算 每秒 6 公尺是 4 級", () => {
    const json = week(weather, values("風速", [[MORNING, { WindSpeed: "6", BeaufortScale: "" }]]));

    expect(parseCwaWeek(json, "臺北市")[0].details.wind).toEqual({ direction: null, level: 4, speed: 6, gust: null });
  });
});

describe("nextDayHours：接下來 24 小時", () => {
  const hourly = (from: string, count: number) => Array.from({ length: count }, (_, index) => hourPoint(new Date(Date.parse(`${from}:00Z`) + index * 3_600_000).toISOString().slice(0, 16), { temperature: 20 }));

  it("台北 14:30 時從 14:00 這一格到明天 13:00 剛好 24 格", () => {
    const hours = nextDayHours(hourly("2026-11-07T10:00", 40), new Date("2026-11-07T06:30:00Z"), 8 * 3600);

    expect(hours).toHaveLength(24);
    expect([hours[0].time, hours.at(-1)?.time]).toEqual(["2026-11-07T14:00", "2026-11-08T13:00"]);
  });

  it("氣象署三小時一格時也只到 24 小時後", () => {
    const every3 = hourly("2026-11-07T15:00", 40).filter((_, index) => index % 3 === 0);

    expect(nextDayHours(every3, new Date("2026-11-07T06:30:00Z"), 8 * 3600).map(({ time }) => time.slice(11))).toEqual(["15:00", "18:00", "21:00", "00:00", "03:00", "06:00", "09:00", "12:00"]);
  });
});
