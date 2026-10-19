import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import { MIN_DATE, addDays, daysBetween, dueStatus, dueText, earliestOf, formatDay, formatSlashDate, lastDayOfMonth, latestOf, parseDate, taipeiToday, weekdayOfDate } from "./dates";

describe("taipeiToday（台北時間的今天）", () => {
  it("UTC 10/13 16:00 是台北 10/14 零點_算 10/14", () => {
    expect(taipeiToday(new Date("2026-10-13T16:00:00Z"))).toBe("2026-10-14");
  });

  it("UTC 10/13 15:59:59 是台北 10/13 23:59:59_還是 10/13", () => {
    expect(taipeiToday(new Date("2026-10-13T15:59:59Z"))).toBe("2026-10-13");
  });

  it("UTC 12/31 16:00 是台北隔年 1/1_跨年", () => {
    expect(taipeiToday(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });

  it.each(ICU_VARIANTS)("ICU 版本不同（$name）_台北 9/1 還是 2026-09-01", (variant) => {
    simulateIcu(variant);

    expect(taipeiToday(new Date("2026-08-31T16:00:00Z"))).toBe("2026-09-01");
  });
});

describe("lastDayOfMonth（月底是幾號）", () => {
  it.each([
    ["2026-01", 31],
    ["2026-02", 28],
    ["2028-02", 29],
    ["2000-02", 29],
    ["2100-02", 28],
    ["2026-04", 30],
    ["2026-12", 31],
  ])("%s_是 %i 日", (month, day) => {
    expect(lastDayOfMonth(month)).toBe(day);
  });
});

describe("parseDate（YYYY-MM-DD）", () => {
  it.each(["2026-10-14", "2028-02-29", "2026-12-31", MIN_DATE])("%s_合法", (raw) => {
    expect(parseDate(raw)).toBe(raw);
  });

  it.each([
    ["2026-02-29", "不是閏年"],
    ["2026-04-31", "4 月沒有 31 日"],
    ["2026-13-01", "沒有 13 月"],
    ["2026-00-10", "沒有 0 月"],
    ["2026-10-00", "沒有 0 日"],
    ["2026-10-32", "沒有 32 日"],
    ["2026-1-5", "沒補零"],
    ["2026/10/14", "斜線"],
    [" 2026-10-14", "前面有空白"],
    ["2026-10-14T00:00", "多了時間"],
    ["1999-12-31", "早於 2000 年"],
    ["", "空字串"],
  ])("%j（%s）_不合法", (raw) => {
    expect(parseDate(raw)).toBeNull();
  });

  it.each([undefined, null, 20261014])("非字串 %j_不合法", (raw) => {
    expect(parseDate(raw)).toBeNull();
  });
});

describe("formatDay", () => {
  it.each([
    ["2026-10-14", "10 月 14 日（三）"],
    ["2026-10-18", "10 月 18 日（日）"],
    ["2026-01-01", "1 月 1 日（四）"],
  ])("%s_顯示成 %s", (date, expected) => {
    expect(formatDay(date)).toBe(expected);
  });
});

describe("addDays 與 daysBetween（日期字串的加減，跨月、跨年、閏年）", () => {
  it.each([
    ["2026-10-15", 7, "2026-10-22"],
    ["2026-10-15", -70, "2026-08-06"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
  ])("%s 加 %i 天_是 %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
    expect(daysBetween(date, expected)).toBe(days);
  });

  it("比較早的日期_是負的天數（逾期幾天）", () => {
    expect(daysBetween("2026-10-15", "2026-10-05")).toBe(-10);
  });
});

describe("weekdayOfDate 與 formatSlashDate", () => {
  it("2026-10-10 是星期六、2026-10-11 是星期日（0）", () => {
    expect(weekdayOfDate("2026-10-10")).toBe(6);
    expect(weekdayOfDate("2026-10-11")).toBe(0);
  });

  it("到期的短寫法不補零_10/20、1/5", () => {
    expect(formatSlashDate("2026-10-20")).toBe("10/20");
    expect(formatSlashDate("2027-01-05")).toBe("1/5");
  });
});

describe("dueStatus 與 dueText（到期的狀態與寫法）", () => {
  it("日期過了是 overdue、當天是 today、還沒到是 upcoming", () => {
    expect([dueStatus("2026-10-14", "2026-10-15"), dueStatus("2026-10-15", "2026-10-15"), dueStatus("2026-10-20", "2026-10-15")]).toEqual(["overdue", "today", "upcoming"]);
  });

  it("SPEC 的寫法：還有 5 天、今天、逾期 2 天", () => {
    expect([dueText(5), dueText(0), dueText(-2)]).toEqual(["還有 5 天", "今天", "逾期 2 天"]);
  });
});

describe("latestOf 與 earliestOf（幾個日期或月份裡最晚、最早的）", () => {
  it("略過不知道的（null、undefined）；都不知道時是 null", () => {
    expect(latestOf(["2026-09-01", undefined, "2026-10-14", null, "2026-10-02"])).toBe("2026-10-14");
    expect(earliestOf(["2026-09-01", undefined, "2026-10-14", null, "2026-10-02"])).toBe("2026-09-01");
    expect(latestOf([undefined, null])).toBeNull();
    expect(earliestOf([])).toBeNull();
  });

  it("月份也一樣_跨年照年份比", () => {
    expect(latestOf(["2026-12", "2027-01", "2026-03"])).toBe("2027-01");
    expect(earliestOf(["2026-12", "2027-01", "2026-03"])).toBe("2026-03");
  });
});
