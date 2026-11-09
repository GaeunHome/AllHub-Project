import { describe, expect, it } from "vitest";
import { NO_DETAILS, hourPoint, weekDay } from "../../dev/fixtures";
import type { DayDetails } from "../../lib/details";
import type { HourPoint } from "../../lib/weekly";
import { detailTiles, heroImage, hourColumns, todayText, weekRows } from "../weekly-view";

const day = (date: string, low: number | null, high: number | null, weather: string | null = "晴", rain: number | null = 10) => weekDay(date, { weather, high, low, rain });

describe("weekRows：一週的溫度條", () => {
  it("位置照這一週最低到最高的比例 10 到 20 度時 15 度在正中間", () => {
    const rows = weekRows([day("2026-11-05", 10, 20), day("2026-11-06", 15, 15)]);

    expect(rows[0]).toMatchObject({ left: 0, right: 0 });
    expect(rows[1]).toMatchObject({ left: 50, right: 50 });
  });

  it("第一天寫今天 其他寫星期 2026-11-06 是星期五", () => {
    expect(weekRows([day("2026-11-05", 10, 20), day("2026-11-06", 10, 20)]).map((row) => row.label)).toEqual(["今天", "星期五"]);
  });

  it("每天溫度都一樣 不會除以零", () => {
    expect(weekRows([day("2026-11-05", 15, 15)])[0]).toMatchObject({ left: 0, right: 0 });
  });

  it("讀不到溫度的那天撐滿 不是 NaN", () => {
    expect(weekRows([day("2026-11-05", null, null), day("2026-11-06", 10, 20)])[0]).toMatchObject({ left: 0, right: 0 });
  });

  it("圖示照天氣", () => {
    expect(weekRows([day("2026-11-05", 10, 20, "短暫雨")])[0].art).toBe("rain");
  });
});

describe("heroImage：天氣頁的大圖", () => {
  it("內建地點用固定的照片 跟天氣無關", () => {
    expect(heroImage("東京", day("2026-11-05", 10, 20, "雷雨"))).toBe(heroImage("東京", day("2026-11-05", 10, 20, "晴")));
    expect(heroImage("東京", undefined)).toMatch(/^\/images\/cities\/.+\.webp$/);
  });

  it("舊的英文搜尋加進來的城市沒有照片 退回照天氣挑的場景圖", () => {
    expect(heroImage("Seattle, United States", day("2026-11-05", 10, 20, "雷雨"))).toBe("/images/scenes/weather-storm-day.svg");
  });
});

describe("todayText", () => {
  it("天氣 降雨機率與高低溫", () => {
    expect(todayText(day("2026-11-05", 8, 18, "晴", 5))).toBe("晴，降雨機率 5%，最高 18°，最低 8°");
  });

  it("讀不到的不寫", () => {
    expect(todayText(day("2026-11-05", null, 18, null, null))).toBe("最高 18°");
  });
});

describe("hourColumns：照日期分開的每小時", () => {
  it("每一天各一組，寫出幾點，晚上的晴天是月亮", () => {
    const columns = hourColumns([
      hourPoint("2026-11-07T14:00", { temperature: 22, rain: 10, weather: "晴" }),
      hourPoint("2026-11-07T20:00", { temperature: 19, weather: "晴" }),
      hourPoint("2026-11-08T05:00", { temperature: 16, rain: 0, weather: "晴" }),
    ]);

    expect(Object.keys(columns)).toEqual(["2026-11-07", "2026-11-08"]);
    expect(columns["2026-11-07"].map(({ clock, art }) => [clock, art])).toEqual([["14:00", "sun"], ["20:00", "moon"]]);
    expect(columns["2026-11-08"][0].art).toBe("moon");
  });
});

describe("detailTiles：今天的細節 讀不到的那一格不畫", () => {
  const TAIPEI: DayDetails = { feelsHigh: 27, feelsLow: 19, humidity: 78, dewPoint: 18, comfort: "稍有寒意到舒適", wind: { direction: "東北風", level: 3, speed: 5, gust: null }, uv: 6, sunrise: null, sunset: null };
  const hour = hourPoint;
  // 台北 11/9 中午看的接下來 24 小時 氣象署沒有每小時的紫外線
  const NEXT_HOURS = [hour("2026-11-09T14:00", { feels: 28, humidity: 65 }), hour("2026-11-09T15:00", { feels: 29, humidity: 60 }), hour("2026-11-10T05:00", { feels: 18, humidity: 90 })];
  const at = (hours: HourPoint[] = NEXT_HOURS) => ({ clock: "12:00", today: "2026-11-09", hours });

  it("台灣的縣市：體感溫度、濕度、風、紫外線四格，一週預報沒有日出日落", () => {
    expect(detailTiles(TAIPEI, at()).map(({ label, value }) => [label, value])).toEqual([
      ["體感溫度", "19–27°"],
      ["濕度", "78%"],
      ["風", "東北風"],
      ["紫外線", "6"],
    ]);
  });

  it("使用者選的每格多兩三個數字：體感寫舒適度與接下來 24 小時最高最低在幾點，明天的時間前面寫明天", () => {
    expect(detailTiles(TAIPEI, at())[0].lines).toEqual(["稍有寒意到舒適", "最高 29° 15:00", "最低 18° 明天 05:00"]);
  });

  it("濕度寫露點與接下來 24 小時最高最低在幾點", () => {
    expect(detailTiles(TAIPEI, at())[1].lines).toEqual(["露點 18°", "最高 90% 明天 05:00", "最低 60% 15:00"]);
  });

  it("風寫級數與氣象署的風級名稱、每秒幾公尺；國外多了陣風的級數", () => {
    expect(detailTiles(TAIPEI, at())[2].lines).toEqual(["3 級 微風", "每秒 5 公尺"]);
    expect(detailTiles({ ...TAIPEI, wind: { direction: "偏西風", level: 3, speed: 4.2, gust: 5 } }, at())[2].lines).toEqual(["3 級 微風", "每秒 4.2 公尺", "陣風 5 級"]);
  });

  it("紫外線第一行是氣象署的等級；國外有每小時的紫外線時多寫最強在幾點", () => {
    const [, , , uv] = detailTiles(TAIPEI, at());
    const abroad = detailTiles(TAIPEI, at([hour("2026-11-09T11:00", { uv: 5 }), hour("2026-11-09T12:00", { uv: 7 }), hour("2026-11-09T13:00", { uv: 7 })]))[3];

    expect(uv.lines[0]).toBe("高量級");
    expect(uv.lines).not.toContainEqual(expect.stringContaining("最強"));
    expect(abroad.lines).toContain("最強 12:00");
  });

  it("沒有每小時的資料時只寫一天的數字，不寫最高最低", () => {
    const [feels, humidity] = detailTiles(TAIPEI, at([]));

    expect(feels.lines).toEqual(["稍有寒意到舒適"]);
    expect(humidity.lines).toEqual(["露點 18°"]);
  });

  it("使用者選的小量表：濕度是水位、風是吹過去的方向、紫外線在高量級那一格，體感溫度沒有量表", () => {
    const [feels, humidity, wind, uv] = detailTiles(TAIPEI, at());

    expect(feels.meter).toBeNull();
    expect(humidity.meter).toEqual({ kind: "fill", at: 78 });
    expect(wind.meter).toEqual({ kind: "toward", degrees: 225 });
    expect(uv.meter).toMatchObject({ kind: "uv" });
    expect(uv.meter?.kind === "uv" && uv.meter.at >= 40 && uv.meter.at < 60).toBe(true);
  });

  it("國外的城市多了日出日落：一格寫日出，下面是日落與白天多長，量表是太陽從日出走到日落的位置（當地時間）", () => {
    expect(detailTiles({ ...TAIPEI, sunrise: "06:00", sunset: "18:00" }, at()).at(-1)).toMatchObject({ label: "日出", value: "06:00", lines: ["日落 18:00", "白天 12 小時"], meter: { kind: "daylight", at: 50 } });
  });

  it("只讀到日出或日落時各寫各的 沒有量表", () => {
    expect(detailTiles({ ...NO_DETAILS, sunrise: "06:05" }, at([]))).toMatchObject([{ label: "日出", value: "06:05", lines: [], meter: null }]);
    expect(detailTiles({ ...NO_DETAILS, sunset: "16:38" }, at([]))).toMatchObject([{ label: "日落", value: "16:38", lines: [], meter: null }]);
  });

  it("讀不到濕度與紫外線時只剩體感與風", () => {
    expect(detailTiles({ ...TAIPEI, humidity: null, uv: null }, at()).map(({ label }) => label)).toEqual(["體感溫度", "風"]);
  });

  it("體感只讀到一個數字時寫一個 風只讀到級數時寫級數，下面只寫風級名稱", () => {
    const tiles = detailTiles({ ...NO_DETAILS, feelsHigh: 30, wind: { direction: null, level: 2, speed: null, gust: null } }, at([]));

    expect(tiles.map(({ value, lines }) => [value, lines])).toEqual([
      ["30°", []],
      ["2 級", ["輕風"]],
    ]);
  });

  it("晴朗的晚上紫外線是 0 也照寫 那是讀得到的數字", () => {
    expect(detailTiles({ ...NO_DETAILS, uv: 0 }, at([]))).toMatchObject([{ label: "紫外線", value: "0", lines: expect.arrayContaining(["低量級"]) }]);
  });

  it("全部讀不到時沒有格子 整區不出現", () => {
    expect(detailTiles(NO_DETAILS, at([]))).toEqual([]);
  });
});
