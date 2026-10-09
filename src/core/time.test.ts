import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import { formatRelativeTime, formatTaipeiDateTime, formatTaipeiHourMinute, formatTaipeiMonthDay, taipeiDateKey } from "./time";

describe("formatTaipeiDateTime", () => {
  it.each([
    ["2026-10-21T04:05:00Z", "2026/10/21 12:05", "UTC 加 8 小時"],
    ["2026-10-20T15:59:00Z", "2026/10/20 23:59", "台北午夜前一分鐘"],
    ["2026-10-20T16:00:00Z", "2026/10/21 00:00", "台北過了午夜、UTC 還是前一天_時顯示 00 不是 24"],
    ["2026-12-31T15:59:00Z", "2026/12/31 23:59", "台北跨年前一分鐘"],
    ["2026-12-31T16:00:00Z", "2027/1/1 00:00", "台北已經跨年、UTC 還是 12/31"],
    ["2027-01-04T17:05:00Z", "2027/1/5 01:05", "月日不補零、時分補零"],
    ["2026-10-21T04:05:59.999Z", "2026/10/21 12:05", "秒數捨去不進位"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(formatTaipeiDateTime(new Date(iso))).toBe(expected);
  });
});

describe("formatTaipeiMonthDay", () => {
  it.each([
    ["2026-10-09T15:59:00Z", "10/9", "台北午夜前"],
    ["2026-10-09T16:00:00Z", "10/10", "台北過了午夜就是隔天"],
    ["2026-12-31T16:00:00Z", "1/1", "台北已經跨年"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(formatTaipeiMonthDay(new Date(iso))).toBe(expected);
  });
});

describe("formatTaipeiHourMinute", () => {
  it.each([
    ["2026-10-07T15:59:00Z", "23:59", "台北午夜前"],
    ["2026-10-07T16:05:00Z", "00:05", "午夜是 00 不是 24"],
    ["2026-10-07T17:05:00Z", "01:05", "一位數的時補零"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(formatTaipeiHourMinute(new Date(iso))).toBe(expected);
  });
});

describe("taipeiDateKey", () => {
  it.each([
    ["2026-10-20T15:59:59.999Z", "2026-10-20", "台北午夜前最後一刻"],
    ["2026-10-20T16:00:00Z", "2026-10-21", "台北午夜、UTC 還是前一天"],
    ["2026-12-31T16:00:00Z", "2027-01-01", "台北已經跨年"],
    ["2027-01-04T17:05:00Z", "2027-01-05", "月日補零，字串可以直接比大小"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(taipeiDateKey(new Date(iso))).toBe(expected);
  });
});

describe("ICU 版本不同時輸出不變", () => {
  // 台北 2027/1/5 01:05：月、日、時都是一位數，補零規則不同時看得出來
  const instant = new Date("2027-01-04T17:05:00Z");

  it.each(ICU_VARIANTS)("模擬「$name」_四個函式的輸出都跟平常一樣", (variant) => {
    simulateIcu(variant);

    expect(formatTaipeiDateTime(instant)).toBe("2027/1/5 01:05");
    expect(formatTaipeiMonthDay(instant)).toBe("1/5");
    expect(formatTaipeiHourMinute(instant)).toBe("01:05");
    expect(taipeiDateKey(instant)).toBe("2027-01-05");
  });

  it.each(ICU_VARIANTS)("模擬「$name」_對照組：舊的 zh-TW dateStyle .format() 寫法會跟畫面要的不一樣", (variant) => {
    simulateIcu(variant);
    const legacy = new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Taipei" });

    expect(legacy.format(instant)).not.toBe("2027/1/5 01:05");
  });
});

describe("formatRelativeTime：影片卡片上的「3 小時前」", () => {
  const NOW = new Date("2026-10-08T12:00:00Z");
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it.each([
    [30_000, "剛剛"],
    [MINUTE, "1 分鐘前"],
    [59 * MINUTE + 59_000, "59 分鐘前"],
    [HOUR, "1 小時前"],
    [23 * HOUR + 59 * MINUTE, "23 小時前"],
    [DAY, "1 天前"],
    [6 * DAY + 23 * HOUR, "6 天前"],
    [7 * DAY, "1 週前"],
    [29 * DAY, "4 週前"],
    [30 * DAY, "1 個月前"],
    [364 * DAY, "11 個月前"],
    [365 * DAY, "1 年前"],
    [800 * DAY, "2 年前"],
  ])("%d 毫秒前 → %s", (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected);
  });

  it("時間在未來（伺服器時鐘有誤差）_當成剛剛", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe("剛剛");
  });
});
