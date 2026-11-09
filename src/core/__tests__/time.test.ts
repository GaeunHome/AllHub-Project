import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import {
  addDaysToKey,
  dateKeyOf,
  daysBetweenKeys,
  formatRelativeTime,
  formatTaipeiDateTime,
  formatTaipeiLongDate,
  formatTaipeiHourMinute,
  formatTaipeiHourMinuteSecond,
  formatTaipeiMonthDay,
  formatTaipeiWeekday,
  isRealDateKey,
  taipeiDateKey,
  taipeiDayOffset,
  taipeiMonthKey,
  weekdayOfKey,
} from "../time";

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

describe("formatTaipeiLongDate", () => {
  it.each([
    // 2026/11/4 是星期三 2026/1/1 是星期四
    ["2026-11-04T02:00:00.000Z", "11 月 4 日 星期三"],
    ["2026-01-01T00:00:00.000Z", "1 月 1 日 星期四"],
    // UTC 還是 11/4 台北已經 11/5 星期也要跟著換
    ["2026-11-04T16:30:00.000Z", "11 月 5 日 星期四"],
    // 週日是 0 不能寫成星期零
    ["2026-11-08T02:00:00.000Z", "11 月 8 日 星期日"],
  ])("%s 是 %s", (iso, expected) => {
    expect(formatTaipeiLongDate(new Date(iso))).toBe(expected);
  });
});

describe("formatTaipeiWeekday：Twitch 開台時間表的週五 20:00", () => {
  it("照台北的日期算：UTC 11/12 晚上已經是台北 11/13 星期五", () => {
    expect(formatTaipeiWeekday(new Date("2026-11-12T16:30:00.000Z"))).toBe("五");
    expect(formatTaipeiWeekday(new Date("2026-11-08T02:00:00.000Z"))).toBe("日");
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

describe("formatTaipeiHourMinuteSecond：導覽列的時鐘", () => {
  it.each([
    ["2026-10-07T04:05:09Z", "12:05:09", "UTC 加 8 小時，分秒補零"],
    ["2026-10-07T15:59:59Z", "23:59:59", "台北午夜前最後一秒"],
    ["2026-10-07T16:00:00Z", "00:00:00", "午夜是 00 不是 24（h23）"],
    ["2026-10-07T16:00:07Z", "00:00:07", "午夜過後幾秒也是 00"],
    ["2026-10-07T17:05:09Z", "01:05:09", "一位數的時補零"],
    ["2026-12-31T16:00:00Z", "00:00:00", "台北已經跨年、UTC 還是 12/31"],
    ["2026-10-07T04:05:09.999Z", "12:05:09", "毫秒捨去不進位"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(formatTaipeiHourMinuteSecond(new Date(iso))).toBe(expected);
  });

  it("加了秒之後_其他函式照舊不顯示秒、也不因為秒進位", () => {
    // 台北 2026/10/7 23:59:59.999 秒一進位就會變成隔天
    const instant = new Date("2026-10-07T15:59:59.999Z");

    expect(formatTaipeiDateTime(instant)).toBe("2026/10/7 23:59");
    expect(formatTaipeiMonthDay(instant)).toBe("10/7");
    expect(formatTaipeiHourMinute(instant)).toBe("23:59");
    expect(taipeiDateKey(instant)).toBe("2026-10-07");
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

describe("taipeiMonthKey：伺服器是 UTC 月底晚上八點後會差一個月", () => {
  it.each([
    ["2026-10-31T15:59:59Z", "2026-10", "台北 10/31 23:59"],
    ["2026-10-31T16:00:00Z", "2026-11", "台北已經 11/1、UTC 還是 10/31"],
    ["2026-12-31T16:00:00Z", "2027-01", "台北已經跨年"],
  ])("%s → %s（%s）", (iso, expected) => {
    expect(taipeiMonthKey(new Date(iso))).toBe(expected);
  });
});

describe("taipeiDayOffset：照台北的日曆算差幾天，不看幾點", () => {
  // 台北 2026/10/20 23:30
  const now = new Date("2026-10-20T15:30:00Z");

  it.each([
    ["2026-10-20T16:00:00Z", 1, "只差 30 分鐘、但台北已經是隔天"],
    ["2026-10-19T16:00:00Z", 0, "台北同一天的 00:00"],
    ["2026-10-19T15:59:00Z", -1, "台北前一天的 23:59"],
    ["2026-10-22T08:00:00Z", 2, "後天"],
    ["2026-12-31T16:00:00Z", 73, "跨年也照日曆算：10 月還有 11 天、11 月 30 天、12 月 31 天，再加 1 月 1 日"],
  ])("%s → %d（%s）", (iso, expected) => {
    expect(taipeiDayOffset(new Date(iso), now)).toBe(expected);
  });
});

describe("isRealDateKey：YYYY-MM-DD 而且日曆上真的有這一天", () => {
  it.each(["2026-01-01", "2026-12-31", "2026-02-28", "2026-04-30", "1999-12-31"])("%s 是真的日期", (date) => {
    expect(isRealDateKey(date)).toBe(true);
  });

  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"])("%s 日曆上沒有這一天", (date) => {
    expect(isRealDateKey(date)).toBe(false);
  });

  it("閏年照西曆的規則：4 的倍數有 2/29，100 的倍數沒有，400 的倍數有", () => {
    expect(isRealDateKey("2028-02-29")).toBe(true);
    expect(isRealDateKey("2100-02-29")).toBe(false);
    expect(isRealDateKey("2000-02-29")).toBe(true);
  });

  it.each(["", "明天", "2026-1-05", "2026-01-5", "26-01-05", "2026/01/05", "20260105", "2026-01-05T00:00:00Z", " 2026-01-05", "2026-01-05\n"])("格式不對（%j）不算", (date) => {
    expect(isRealDateKey(date)).toBe(false);
  });
});

describe("日期字串（YYYY-MM-DD）的運算：只看日曆，不看時區與幾點", () => {
  it.each([
    ["2026-11-09", 1, "2026-11-10", "隔天"],
    ["2026-01-31", 1, "2026-02-01", "跨月"],
    ["2026-12-31", 1, "2027-01-01", "跨年"],
    ["2028-02-28", 1, "2028-02-29", "閏年有 2/29"],
    ["2027-02-28", 1, "2027-03-01", "平年沒有 2/29"],
    ["2028-03-01", -1, "2028-02-29", "往回跨到閏日"],
    ["2026-11-09", -7, "2026-11-02", "往回 7 天"],
    ["2026-11-09", 0, "2026-11-09", "0 天是同一天"],
    ["2026-11-09", 60, "2027-01-08", "60 天後跨年：11 月剩 21 天、12 月 31 天、再 8 天"],
  ])("addDaysToKey(%s, %i) → %s（%s）", (key, days, expected) => {
    expect(addDaysToKey(key, days)).toBe(expected);
  });

  it.each([
    ["2026-11-09", "2026-11-09", 0, "同一天"],
    ["2026-11-09", "2026-11-10", 1, "明天"],
    ["2026-11-10", "2026-11-09", -1, "昨天是負的"],
    ["2026-01-31", "2026-03-01", 29, "跨過平年的 2 月：1 + 28"],
    ["2028-01-31", "2028-03-01", 30, "跨過閏年的 2 月：1 + 29"],
    ["2026-12-25", "2027-01-05", 11, "跨年：12 月剩 6 天、再 5 天"],
  ])("daysBetweenKeys(%s, %s) → %i（%s）", (from, to, expected) => {
    expect(daysBetweenKeys(from, to)).toBe(expected);
  });

  it.each([
    ["2026-11-09", 1, "星期一"],
    ["2026-11-08", 0, "星期日"],
    ["2026-11-14", 6, "星期六"],
    ["2028-02-29", 2, "閏日是星期二"],
    ["2027-01-01", 5, "2027 年元旦是星期五"],
  ])("weekdayOfKey(%s) → %i（%s，0 是星期日）", (key, expected) => {
    expect(weekdayOfKey(key)).toBe(expected);
  });

  it.each([
    [2026, 11, 9, "2026-11-09", "月日補零"],
    [2026, 2, 31, "2026-02-28", "平年 2 月沒有 31 號：算月底"],
    [2028, 2, 30, "2028-02-29", "閏年 2 月算到 29 號"],
    [2026, 4, 31, "2026-04-30", "小月沒有 31 號"],
    [2026, 12, 31, "2026-12-31", "大月照原日"],
  ])("dateKeyOf(%i, %i, %i) → %s（%s）", (year, month, day, expected) => {
    expect(dateKeyOf(year, month, day)).toBe(expected);
  });
});

describe("ICU 版本不同時輸出不變", () => {
  // 台北 2027/1/5 01:05:07 月日時秒都是一位數 補零規則不同時看得出來
  const instant = new Date("2027-01-04T17:05:07Z");

  it.each(ICU_VARIANTS)("模擬「$name」_五個函式的輸出都跟平常一樣", (variant) => {
    simulateIcu(variant);

    expect(formatTaipeiDateTime(instant)).toBe("2027/1/5 01:05");
    expect(formatTaipeiMonthDay(instant)).toBe("1/5");
    expect(formatTaipeiHourMinute(instant)).toBe("01:05");
    expect(formatTaipeiHourMinuteSecond(instant)).toBe("01:05:07");
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

  it("最大單位寫到天（通知只留兩週）_7 天以上照樣寫幾天前，不換成週、月", () => {
    expect(formatRelativeTime(ago(7 * DAY), NOW, { largestUnit: "day" })).toBe("7 天前");
    expect(formatRelativeTime(ago(40 * DAY), NOW, { largestUnit: "day" })).toBe("40 天前");
    expect(formatRelativeTime(ago(3 * HOUR), NOW, { largestUnit: "day" })).toBe("3 小時前");
  });
});
