import { describe, expect, it } from "vitest";
import type { ReminderItem } from "../../service/items";
import { remindersView } from "../reminders-view";

// 台北 11/2 中午
const NOON = new Date("2026-11-02T04:00:00Z");
// 台北 11/3 00:10 UTC 還是 11/2
const NEXT_DAY = new Date("2026-11-02T16:10:00Z");

let nextId = 1;
const item = (date: string, title = "提醒"): ReminderItem => ({ id: nextId++, title, date, notifyDaysBefore: 0 });
const dates = (rows: readonly { date: string }[]) => rows.map((row) => row.date);

describe("首頁卡片的清單", () => {
  it("過期還沒刪的不顯示：日期當天還在，隔天就消失，不等排程", () => {
    const items = [item("2026-11-01"), item("2026-11-02"), item("2026-11-03")];

    expect(dates(remindersView(items, NOON).shown)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(dates(remindersView(items, NEXT_DAY).shown)).toEqual(["2026-11-03"]);
  });

  it("倒數：今天標出來，明天、還有 N 天照台北的日曆算", () => {
    const view = remindersView([item("2026-11-02"), item("2026-11-03"), item("2026-11-05")], NOON);

    expect(view.shown.map((row) => [row.countdown, row.days])).toEqual([
      ["今天", 0],
      ["明天", 1],
      ["還有 3 天", 3],
    ]);
  });

  it("日期寫成月日，不同年寫出年份", () => {
    const view = remindersView([item("2026-11-05"), item("2027-01-05")], NOON);

    expect(view.shown.map((row) => row.dateText)).toEqual(["11/5", "2027/1/5"]);
  });

  it("最近的 5 個直接顯示，其他的收起來：照傳進來的日期順序", () => {
    const items = ["03", "04", "05", "06", "07", "08", "09"].map((day) => item(`2026-11-${day}`));

    const view = remindersView(items, NOON);

    expect(dates(view.shown)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(dates(view.more)).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("剛好 5 個時沒有收起來的", () => {
    expect(remindersView(["03", "04", "05", "06", "07"].map((day) => item(`2026-11-${day}`)), NOON).more).toEqual([]);
  });

  it("過期的不佔名額：5 個過期加 1 個今天，今天的排第一", () => {
    const items = [...["10-28", "10-29", "10-30", "10-31", "11-01"].map((day) => item(`2026-${day}`)), item("2026-11-02")];

    expect(dates(remindersView(items, NOON).shown)).toEqual(["2026-11-02"]);
  });

  it("日期欄位的範圍是今天到 10 年後", () => {
    expect(remindersView([], NOON)).toMatchObject({ today: "2026-11-02", latest: "2036-11-02" });
    expect(remindersView([], NEXT_DAY)).toMatchObject({ today: "2026-11-03", latest: "2036-11-03" });
  });
});
