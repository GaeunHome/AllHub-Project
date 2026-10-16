import { addDays, weekdayOfDate, type DateKey } from "./dates";
import type { HolidayRule } from "./kinds";

// 人事總處的辦公日曆表 data.gov.tw 資料集 14718 每年 6 到 7 月公布下一年後要補上
// 抄是否放假為 2 的週一到週五 週末是否放假為 0 的放進補班 這兩年都沒有補班

/** 表裡有的年份 其他年份只看週末 */
export const HOLIDAY_YEARS = [2026, 2027] as const;

const WEEKDAY_HOLIDAYS: ReadonlySet<DateKey> = new Set([
  // https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202506/a52331bd-a189-466b-b0f0-cae3062bbf74.csv
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-02-27",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-06-19",
  "2026-09-25",
  "2026-09-28",
  "2026-10-09",
  "2026-10-26",
  "2026-12-25",
  // https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv
  "2027-01-01",
  "2027-02-04",
  "2027-02-05",
  "2027-02-08",
  "2027-02-09",
  "2027-02-10",
  "2027-03-01",
  "2027-04-05",
  "2027-04-06",
  "2027-04-30",
  "2027-06-09",
  "2027-09-15",
  "2027-09-28",
  "2027-10-11",
  "2027-10-25",
  "2027-12-24",
  "2027-12-31",
]);

const WEEKEND_WORKDAYS: ReadonlySet<DateKey> = new Set([]);

/** 週末不上班 除非是補班日 平日放假的日子也不是 */
export function isBusinessDay(date: DateKey): boolean {
  const weekday = weekdayOfDate(date);
  if (weekday === 0 || weekday === 6) return WEEKEND_WORKDAYS.has(date);
  return !WEEKDAY_HOLIDAYS.has(date);
}

/** before 往前找到工作日 after 往後找 none 照原日 提前可能跨到上個月 */
export function shiftForHoliday(date: DateKey, rule: HolidayRule): DateKey {
  if (rule === "none") return date;
  const step = rule === "before" ? -1 : 1;
  let shifted = date;
  while (!isBusinessDay(shifted)) shifted = addDays(shifted, step);
  return shifted;
}
