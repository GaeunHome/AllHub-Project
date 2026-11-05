import { describe, expect, it } from "vitest";
import { todayText, weekRows } from "./weekly-view";

const day = (date: string, low: number | null, high: number | null, weather: string | null = "晴", rain: number | null = 10) => ({ date, weather, high, low, rain });

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

describe("todayText", () => {
  it("天氣 降雨機率與高低溫", () => {
    expect(todayText(day("2026-11-05", 8, 18, "晴", 5))).toBe("晴，降雨機率 5%，最高 18°，最低 8°");
  });

  it("讀不到的不寫", () => {
    expect(todayText(day("2026-11-05", null, 18, null, null))).toBe("最高 18°");
  });
});
