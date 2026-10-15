import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import { MIN_DATE, formatDay, formatDayShort, lastDayOfMonth, parseDate, taipeiToday } from "./dates";

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

describe("formatDay 與 formatDayShort", () => {
  it.each([
    ["2026-10-14", "10 月 14 日（三）"],
    ["2026-10-18", "10 月 18 日（日）"],
    ["2026-01-01", "1 月 1 日（四）"],
  ])("%s_顯示成 %s", (date, expected) => {
    expect(formatDay(date)).toBe(expected);
  });

  it.each([
    ["2026-10-13", "13 日（二）"],
    ["2026-10-04", "4 日（日）"],
    ["2026-11-01", "1 日（日）"],
    ["2027-01-01", "1 日（五）"],
    ["2028-02-29", "29 日（二）"],
  ])("短的只有日與星期（同一個月裡用）_%s 顯示成 %s", (date, expected) => {
    expect(formatDayShort(date)).toBe(expected);
  });
});
