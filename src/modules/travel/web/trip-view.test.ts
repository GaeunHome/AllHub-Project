import { describe, expect, it } from "vitest";
import { dateRange, dayViews, shortDate, tripStatus } from "./trip-view";

const TRIP = { startDate: "2026-12-01", endDate: "2026-12-03" };

describe("旅程的日期文字", () => {
  it("每一天寫第幾天與星期：2026/12/1 是星期二", () => {
    expect(dayViews(TRIP)[0]).toEqual({ date: "2026-12-01", label: "第 1 天", detail: "12 月 1 日 星期二", short: "12/1（二）" });
    expect(dayViews(TRIP)).toHaveLength(3);
  });

  it("日期區間；當天來回只寫一天", () => {
    expect(dateRange(TRIP)).toBe("12/1–12/3");
    expect(dateRange({ startDate: "2026-12-01", endDate: "2026-12-01" })).toBe("12/1");
    expect(shortDate("2026-01-05")).toBe("1/5");
  });

  it("還沒出發、明天出發、旅途中、結束後寫幾號刪除", () => {
    expect(tripStatus(TRIP, "2026-11-21")).toBe("還有 10 天出發");
    expect(tripStatus(TRIP, "2026-11-30")).toBe("明天出發");
    expect(tripStatus(TRIP, "2026-12-01")).toBe("旅途中，第 1 天");
    expect(tripStatus(TRIP, "2026-12-03")).toBe("旅途中，第 3 天");
    expect(tripStatus(TRIP, "2026-12-04")).toBe("已結束，12/10 之後自動刪除");
  });
});
