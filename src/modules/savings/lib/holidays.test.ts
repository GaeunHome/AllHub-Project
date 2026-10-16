import { describe, expect, it } from "vitest";
import { taipeiDateKey } from "@/core/time";
import { addDays, weekdayOfDate } from "./dates";
import { HOLIDAY_YEARS, isBusinessDay, shiftForHoliday } from "./holidays";
import type { HolidayRule } from "./kinds";

// 答案來自人事總處的辦公日曆表 data.gov.tw 資料集 14718 的 2026 與 2027 年 CSV
// 是否放假 0 是上班 2 是放假

function daysOf(year: number): string[] {
  const days: string[] = [];
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) days.push(date);
  return days;
}

const workdaysByMonth = (year: number) =>
  daysOf(year)
    .filter(isBusinessDay)
    .reduce<Record<string, number>>((counts, date) => ({ ...counts, [date.slice(5, 7)]: (counts[date.slice(5, 7)] ?? 0) + 1 }), {});

describe("isBusinessDay（照人事總處的辦公日曆表）", () => {
  it("2026 每個月的上班日數跟 CSV 一樣（全年 245 天，2 月春節連假只有 14 天）", () => {
    expect(workdaysByMonth(2026)).toEqual({ "01": 21, "02": 14, "03": 22, "04": 20, "05": 20, "06": 21, "07": 23, "08": 21, "09": 20, "10": 20, "11": 21, "12": 22 });
  });

  it("2027 每個月的上班日數跟 CSV 一樣（全年 244 天）", () => {
    expect(workdaysByMonth(2027)).toEqual({ "01": 20, "02": 15, "03": 22, "04": 19, "05": 21, "06": 21, "07": 22, "08": 22, "09": 20, "10": 19, "11": 22, "12": 21 });
  });

  it.each([
    ["2026-01-01", "週四 開國紀念日", false],
    ["2026-01-02", "週五", true],
    ["2026-02-16", "週一 農曆除夕", false],
    ["2026-02-20", "週五 春節補假", false],
    ["2026-02-23", "週一 春節後上班", true],
    ["2026-02-27", "週五 和平紀念日補假", false],
    ["2026-10-09", "週五 國慶日補假", false],
    ["2026-10-12", "週一", true],
    ["2026-10-26", "週一 光復節補假", false],
    ["2027-02-04", "週四 小年夜", false],
    ["2027-02-11", "週四 春節後上班", true],
    ["2027-12-31", "週五 2028 元旦的補假", false],
  ])("%s（%s）_上班是 %s", (date, _note, expected) => {
    expect(isBusinessDay(date)).toBe(expected);
  });

  it("2026、2027 沒有補班：週末一律不上班", () => {
    const weekends = [...daysOf(2026), ...daysOf(2027)].filter((date) => weekdayOfDate(date) === 0 || weekdayOfDate(date) === 6);

    expect(weekends.length).toBeGreaterThan(200);
    expect(weekends.filter(isBusinessDay)).toEqual([]);
  });

  it("表裡沒有的年份只看週末：2028-01-03（一）上班、2028-01-01（六）不上班", () => {
    expect(isBusinessDay("2028-01-03")).toBe(true);
    expect(isBusinessDay("2028-01-01")).toBe(false);
  });
});

describe("shiftForHoliday（遇假日提前或延後）", () => {
  it.each<[string, HolidayRule, string, string]>([
    ["2026-10-10", "before", "2026-10-08", "國慶日（六）和前一天的補假都放假，提前到週四"],
    ["2026-10-10", "after", "2026-10-12", "延後到週一"],
    ["2026-10-10", "none", "2026-10-10", "照原日"],
    ["2026-10-14", "before", "2026-10-14", "本來就是上班日，不動"],
    ["2026-03-01", "before", "2026-02-26", "跨到上個月：週日、和平紀念日（六）、補假（五）都放假"],
    ["2026-02-15", "after", "2026-02-23", "春節連假後的第一個上班日"],
    ["2027-01-01", "before", "2026-12-31", "跨年往前：開國紀念日（五）提前到前一年的週四"],
    ["2027-12-31", "after", "2028-01-03", "跨年往後：2028 還沒有資料，只跳過週末"],
  ])("%s %s_是 %s（%s）", (date, rule, expected) => {
    expect(shiftForHoliday(date, rule)).toBe(expected);
  });
});

describe("假日資料要每年更新", () => {
  it("今年的資料要在；7 月以後（人事總處 6～7 月公布下一年）明年的也要在", () => {
    const today = taipeiDateKey(new Date());
    const year = Number(today.slice(0, 4));

    expect(HOLIDAY_YEARS).toContain(year);
    if (Number(today.slice(5, 7)) >= 7) expect(HOLIDAY_YEARS).toContain(year + 1);
  });

  it("列在表裡的每一年都真的抄了放假日（每年的平日放假至少 10 天）", () => {
    for (const year of HOLIDAY_YEARS) {
      const weekdayHolidays = daysOf(year).filter((date) => weekdayOfDate(date) !== 0 && weekdayOfDate(date) !== 6 && !isBusinessDay(date));
      expect(weekdayHolidays.length, String(year)).toBeGreaterThanOrEqual(10);
    }
  });
});
