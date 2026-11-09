import { describe, expect, it } from "vitest";
import { aqiPosition } from "../aqi";
import { beaufortLevel, beaufortName, comfortText, daylightHours, daylightPosition, hourPeak, uvLevel, uvPosition, windDirection, windToward } from "../details";

describe("beaufortLevel：照氣象署的蒲福風級表把風速換成級數", () => {
  it.each([
    [0, 0],
    [0.2, 0],
    [0.3, 1],
    [1.5, 1],
    [1.6, 2],
    [3.3, 2],
    [3.4, 3],
    [5.4, 3],
    [5.5, 4],
    [7.9, 4],
    [8, 5],
    [10.8, 6],
    [13.9, 7],
    [17.2, 8],
    [32.7, 12],
  ])("每秒 %f 公尺是 %i 級", (speed, level) => {
    expect(beaufortLevel(speed)).toBe(level);
  });
});

describe("windDirection：Open-Meteo 的角度是風吹來的方向 0 是北 順時針 寫成氣象署的八個方位", () => {
  it.each([
    [0, "偏北風"],
    [20, "偏北風"],
    [350, "偏北風"],
    [360, "偏北風"],
    [25, "東北風"],
    [45, "東北風"],
    [90, "偏東風"],
    [135, "東南風"],
    [180, "偏南風"],
    [225, "西南風"],
    [270, "偏西風"],
    [315, "西北風"],
  ])("%i 度是%s", (degrees, text) => {
    expect(windDirection(degrees)).toBe(text);
  });
});

describe("uvLevel：氣象署的紫外線指數分級", () => {
  it.each([
    [0, "低量級"],
    [2, "低量級"],
    [3, "中量級"],
    [5, "中量級"],
    [6, "高量級"],
    [7, "高量級"],
    [8, "過量級"],
    [10, "過量級"],
    [11, "危險級"],
    [15, "危險級"],
  ])("%i 是%s", (index, level) => {
    expect(uvLevel(index)).toBe(level);
  });
});

// 使用者選的小量表 色條每一級等寬 標記要落在自己那一級的色塊裡 不能壓在兩級的交界
const segmentOf = (position: number, levels: number) => Math.floor((position / 100) * levels);

describe("uvPosition：紫外線色條上的標記 五級照氣象署的分級", () => {
  it.each([
    [0, 0],
    [2, 0],
    [2.4, 1],
    [3, 1],
    [5, 1],
    [5.5, 2],
    [7, 2],
    [8, 3],
    [10, 3],
    [11, 4],
    [15, 4],
  ])("%s 落在第 %i 格", (index, segment) => {
    expect(segmentOf(uvPosition(index), 5)).toBe(segment);
  });

  it("同一級裡越大越右邊 超過上限停在最右邊", () => {
    expect(uvPosition(7)).toBeGreaterThan(uvPosition(6));
    expect(uvPosition(40)).toBe(100);
  });
});

describe("aqiPosition：空氣品質色條上的標記 六級照環境部的分級", () => {
  it.each([
    [0, 0],
    [50, 0],
    [51, 1],
    [100, 1],
    [101, 2],
    [150, 2],
    [151, 3],
    [200, 3],
    [201, 4],
    [300, 4],
    [301, 5],
  ])("%i 落在第 %i 格", (aqi, segment) => {
    expect(segmentOf(aqiPosition(aqi), 6)).toBe(segment);
  });
});

describe("windToward：風向箭頭指著風吹過去的方向 0 是北 順時針", () => {
  it("東北風往西南吹 偏北風往南吹", () => {
    expect(windToward("東北風")).toBe(225);
    expect(windToward("偏北風")).toBe(180);
    expect(windToward("西北風")).toBe(135);
  });

  it("認不得的寫法不畫箭頭", () => {
    expect(windToward("風向不定")).toBeNull();
  });
});

describe("daylightPosition：日出到日落之間太陽走到哪", () => {
  it("6 點日出 18 點日落 中午在正中間", () => {
    expect(daylightPosition("06:00", "18:00", "12:00")).toBe(50);
  });

  it("日出前在最左邊 日落後在最右邊", () => {
    expect(daylightPosition("06:00", "18:00", "05:00")).toBe(0);
    expect(daylightPosition("06:00", "18:00", "19:30")).toBe(100);
  });
});

describe("beaufortName：氣象署蒲福風級表每一級的名稱", () => {
  it.each([
    [0, "無風"],
    [1, "軟風"],
    [2, "輕風"],
    [3, "微風"],
    [4, "和風"],
    [5, "清風"],
    [6, "強風"],
    [7, "疾風"],
    [8, "大風"],
    [9, "烈風"],
    [10, "狂風"],
    [11, "暴風"],
    [12, "颶風"],
    [17, "颶風"],
  ])("%i 級是%s", (level, name) => {
    expect(beaufortName(level)).toBe(name);
  });
});

describe("comfortText：氣象署一天兩段的舒適度", () => {
  it("最不舒服與最舒服一樣時寫一個 不一樣時從冷寫到熱", () => {
    expect(comfortText("舒適", "舒適")).toBe("舒適");
    expect(comfortText("稍有寒意", "悶熱")).toBe("稍有寒意到悶熱");
  });

  it("只讀到一個時寫那一個 都讀不到是 null", () => {
    expect(comfortText(null, "舒適")).toBe("舒適");
    expect(comfortText("寒冷", null)).toBe("寒冷");
    expect(comfortText(null, null)).toBeNull();
  });
});

describe("hourPeak：接下來每小時裡最高或最低的那一格", () => {
  const hours = [
    { time: "2026-11-09T14:00", value: 24 },
    { time: "2026-11-09T15:00", value: 26 },
    { time: "2026-11-09T18:00", value: 26 },
    { time: "2026-11-10T05:00", value: 16 },
    { time: "2026-11-10T06:00", value: null },
  ];

  it("最高是 26 度 兩格一樣時取比較早的 15:00 最低是隔天 05:00 的 16 度", () => {
    expect(hourPeak(hours, "max")).toEqual({ value: 26, time: "2026-11-09T15:00" });
    expect(hourPeak(hours, "min")).toEqual({ value: 16, time: "2026-11-10T05:00" });
  });

  it("讀不到的格子略過 全部讀不到是 null", () => {
    expect(hourPeak([{ time: "2026-11-09T14:00", value: null }], "max")).toBeNull();
    expect(hourPeak([], "min")).toBeNull();
  });
});

describe("daylightHours：日出到日落有多久", () => {
  it("06:05 到 16:38 是 10 小時 33 分 剛好整點時不寫分", () => {
    expect(daylightHours("06:05", "16:38")).toBe("10 小時 33 分");
    expect(daylightHours("06:00", "18:00")).toBe("12 小時");
  });

  it("日落不比日出晚時是 null 不寫負的", () => {
    expect(daylightHours("18:00", "06:00")).toBeNull();
  });
});
