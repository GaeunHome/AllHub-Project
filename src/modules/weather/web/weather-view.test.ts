import { describe, expect, it } from "vitest";
import { forecastWith } from "../dev/fixtures";
import type { Warning } from "../lib/warnings";
import { weatherView } from "./weather-view";

/** 台北時間 10/19 早上 7 點 現在這一段是今天白天 下一段是今晚 */
const MORNING = new Date("2026-10-18T23:00:00.000Z");
/** 台北時間 10/19 晚上 9 點 現在這一段是今晚 下一段是明天白天 */
const EVENING = new Date("2026-10-19T13:00:00.000Z");

const reminderAt = (rains: (number | null)[], now = MORNING) => weatherView("臺北市", forecastWith(rains), undefined, now).reminder;

describe("帶傘提醒", () => {
  it("降雨機率最高到 50% 是記得帶傘，30–49% 是帶把折傘，更低是不用帶傘", () => {
    expect(reminderAt([50, 10])).toEqual({ level: "umbrella", title: "記得帶傘", detail: "今天白天降雨機率 50%" });
    expect(reminderAt([49, 10])).toEqual({ level: "maybe", title: "帶把折傘", detail: "今天白天降雨機率 49%" });
    expect(reminderAt([10, 30])).toEqual({ level: "maybe", title: "帶把折傘", detail: "今晚降雨機率 30%" });
    expect(reminderAt([29, 0])).toEqual({ level: "dry", title: "不用帶傘", detail: "今天白天降雨機率 29%" });
  });

  it("只看現在這一段與下一段，寫降雨機率最高的那一段；一樣高時寫比較早的", () => {
    expect(reminderAt([20, 70, 90])?.detail).toBe("今晚降雨機率 70%");
    expect(reminderAt([10, 20, 90])).toMatchObject({ level: "dry", detail: "今晚降雨機率 20%" });
    expect(reminderAt([60, 60])?.detail).toBe("今天白天降雨機率 60%");
  });

  it("晚上看的是今晚與明天白天：已經結束的時段不算", () => {
    expect(reminderAt([90, 40, 70], EVENING)).toEqual({ level: "umbrella", title: "記得帶傘", detail: "明天白天降雨機率 70%" });
  });

  it("讀不到的降雨機率略過；讀不到預報或兩段都讀不到時不顯示提醒", () => {
    expect(reminderAt([null, 40])?.detail).toBe("今晚降雨機率 40%");
    expect(reminderAt([null, null, 80])).toBeNull();
    expect(weatherView("臺北市", null, undefined, MORNING).reminder).toBeNull();
  });
});

describe("天氣警特報的標籤", () => {
  // MORNING 是台北 10/19 早上 7 點
  const chips = (warnings: Warning[] | null, now = MORNING) => weatherView("臺北市", forecastWith([70, 40]), undefined, now, warnings).warnings;

  it("警報用最強的顏色，特報用警示色，順序照讀到的", () => {
    expect(chips([{ label: "海上陸上颱風警報", severe: true, end: null }, { label: "大雨特報", severe: false, end: null }])).toEqual([
      { label: "海上陸上颱風警報", tone: "danger" },
      { label: "大雨特報", tone: "warning" },
    ]);
  });

  it("結束時間今天只寫時間，其他日子寫月日與時間，都是台北時間；讀不到就只寫特報", () => {
    expect(chips([{ label: "大雨特報", severe: false, end: "2026-10-19T12:00:00.000Z" }])[0].label).toBe("大雨特報 到 20:00");
    // 台北 10/20 00:30 UTC 還是 10/19 不能照 UTC 的日期算成今天
    expect(chips([{ label: "大雨特報", severe: false, end: "2026-10-19T16:30:00.000Z" }])[0].label).toBe("大雨特報 到 10/20 00:30");
    expect(chips([{ label: "大雨特報", severe: false, end: "2026-10-21T00:00:00.000Z" }])[0].label).toBe("大雨特報 到 10/21 08:00");
    expect(chips([{ label: "大雨特報", severe: false, end: null }])[0].label).toBe("大雨特報");
  });

  it("過了午夜看，照台北的日期判斷：今天結束的只寫時間，之後的日子寫月日", () => {
    const pastMidnight = new Date("2026-10-19T16:30:00.000Z");

    expect(chips([{ label: "濃霧特報", severe: false, end: "2026-10-19T17:00:00.000Z" }], pastMidnight)[0].label).toBe("濃霧特報 到 01:00");
    expect(chips([{ label: "濃霧特報", severe: false, end: "2026-10-20T15:00:00.000Z" }], pastMidnight)[0].label).toBe("濃霧特報 到 23:00");
    expect(chips([{ label: "濃霧特報", severe: false, end: "2026-10-20T16:30:00.000Z" }], pastMidnight)[0].label).toBe("濃霧特報 到 10/21 00:30");
  });

  it("沒有特報或讀不到時是空的；沒傳也一樣", () => {
    expect(chips([])).toEqual([]);
    expect(chips(null)).toEqual([]);
    expect(weatherView("臺北市", null, undefined, MORNING).warnings).toEqual([]);
  });

  it("結束時間已過的特報不顯示，還沒結束的照常", () => {
    const ended = { label: "大雨特報", severe: false, end: new Date(MORNING.getTime() - 60_000).toISOString() };
    const lasting = { label: "濃霧特報", severe: false, end: new Date(MORNING.getTime() + 60_000).toISOString() };

    expect(chips([ended, lasting]).map((chip) => chip.label)).toEqual([expect.stringContaining("濃霧特報")]);
  });
});
