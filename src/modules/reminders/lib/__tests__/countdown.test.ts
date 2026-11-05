import { describe, expect, it } from "vitest";
import { countdownText, daysUntil, formatDate } from "../countdown";

// 台北比 UTC 快 8 小時 UTC 16:00 就是台北隔天的 00:00
const BEFORE_MIDNIGHT = new Date("2026-11-01T15:59:59Z");
const AFTER_MIDNIGHT = new Date("2026-11-01T16:00:00Z");

describe("還有幾天", () => {
  it("照台北的日曆算，不看幾點：過了台北的午夜就少一天，UTC 還是前一天也一樣", () => {
    expect(daysUntil("2026-11-02", BEFORE_MIDNIGHT)).toBe(1);
    expect(daysUntil("2026-11-02", AFTER_MIDNIGHT)).toBe(0);
    expect(daysUntil("2026-11-05", AFTER_MIDNIGHT)).toBe(3);
  });

  it("跨月、跨年與閏年都是實際的天數", () => {
    expect(daysUntil("2026-12-01", AFTER_MIDNIGHT)).toBe(29);
    expect(daysUntil("2027-01-01", AFTER_MIDNIGHT)).toBe(60);
    expect(daysUntil("2028-03-01", new Date("2028-02-28T04:00:00Z"))).toBe(2);
  });

  it("當天寫今天、隔天寫明天，其他寫還有 N 天", () => {
    expect(countdownText(0)).toBe("今天");
    expect(countdownText(1)).toBe("明天");
    expect(countdownText(2)).toBe("還有 2 天");
    expect(countdownText(30)).toBe("還有 30 天");
  });
});

describe("日期的寫法", () => {
  it("今年的只寫月日（不補零），不同年寫出年份才不會看錯", () => {
    expect(formatDate("2026-11-05", "2026-11-02")).toBe("11/5");
    expect(formatDate("2027-01-05", "2026-11-02")).toBe("2027/1/5");
    expect(formatDate("2036-11-02", "2026-11-02")).toBe("2036/11/2");
  });
});
