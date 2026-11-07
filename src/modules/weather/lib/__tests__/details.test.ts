import { describe, expect, it } from "vitest";
import { beaufortLevel, uvLevel, windDirection } from "../details";

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
