import { describe, expect, it } from "vitest";
import type { ForecastPeriod } from "./forecast";
import { rainOutlook } from "./rain";

// 台北 10/19 06:00 起的今天白天與 18:00 起的今晚
const DAY = { start: "2026-10-18T22:00:00.000Z", end: "2026-10-19T10:00:00.000Z" };
const NIGHT = { start: "2026-10-19T10:00:00.000Z", end: "2026-10-19T22:00:00.000Z" };
const period = (slot: { start: string; end: string }, rain: number | null): ForecastPeriod => ({ ...slot, description: "多雲", rain, minTemp: 22, maxTemp: 28, comfort: "舒適" });

describe("要不要帶傘", () => {
  it("看兩段裡最高的降雨機率：50% 以上帶傘、30–49% 帶把折傘、不到 30% 不用", () => {
    const levelOf = (day: number, night: number) => rainOutlook([period(DAY, day), period(NIGHT, night)])?.level;

    expect([levelOf(20, 50), levelOf(70, 10), levelOf(49, 0), levelOf(10, 30), levelOf(29, 20), levelOf(0, 0)]).toEqual(["umbrella", "umbrella", "maybe", "maybe", "dry", "dry"]);
  });

  it("最高的是哪一段：晚上比較高就是今晚；兩段一樣高時取比較早的那段", () => {
    expect(rainOutlook([period(DAY, 20), period(NIGHT, 70)])?.peak).toMatchObject({ start: NIGHT.start, rain: 70 });
    expect(rainOutlook([period(DAY, 60), period(NIGHT, 60)])?.peak).toMatchObject({ start: DAY.start, rain: 60 });
    expect(rainOutlook([period(NIGHT, 60), period(DAY, 60)])?.peak).toMatchObject({ start: DAY.start, rain: 60 });
  });

  it("讀不到降雨機率的時段略過；兩段都讀不到（或沒有時段）時不判斷", () => {
    expect(rainOutlook([period(DAY, null), period(NIGHT, 40)])).toMatchObject({ level: "maybe", peak: { start: NIGHT.start, rain: 40 } });
    expect(rainOutlook([period(DAY, null), period(NIGHT, null)])).toBeNull();
    expect(rainOutlook([])).toBeNull();
  });
});
