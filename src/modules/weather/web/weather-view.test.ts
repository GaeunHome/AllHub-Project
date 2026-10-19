import { describe, expect, it } from "vitest";
import { forecastWith } from "../dev/fixtures";
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
