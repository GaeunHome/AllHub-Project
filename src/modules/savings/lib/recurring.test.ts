import { describe, expect, it } from "vitest";
import type { HolidayRule } from "./kinds";
import {
  dueMonths,
  nextRunDate,
  occurrenceDate,
  pendingOccurrences,
  previousOccurrenceMonth,
  recurringTitle,
  scheduleText,
  scheduledDate,
  type RecurringLike,
} from "./recurring";

/** 台北時間那天中午建立 */
const createdOn = (date: string) => new Date(`${date}T04:00:00Z`);
/** 舊資料的預設 每月 照原日 */
const rule = (dayOfMonth: number, created: string, lastPostedMonth: string | null = null, extra: Partial<RecurringLike> = {}): RecurringLike => ({
  dayOfMonth,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  lastPostedMonth,
  createdAt: createdOn(created),
  ...extra,
});

describe("scheduledDate（那個月要記的日期）", () => {
  it.each([
    ["2026-10", 6, "2026-10-06"],
    ["2026-01", 31, "2026-01-31"],
    ["2026-04", 31, "2026-04-30"],
    ["2026-02", 30, "2026-02-28"],
    ["2028-02", 31, "2028-02-29"],
    ["2026-12", 1, "2026-12-01"],
  ])("%s 的 %i 日_是 %s（沒有那一天就記在月底）", (month, day, expected) => {
    expect(scheduledDate(month, day)).toBe(expected);
  });
});

describe("dueMonths（到今天為止該記、還沒記的月份）", () => {
  it("建立當月的日期已經過了_從下個月開始", () => {
    expect(dueMonths(rule(6, "2026-10-14"), "2026-10-14")).toEqual([]);
    expect(dueMonths(rule(6, "2026-10-14"), "2026-11-05")).toEqual([]);
    expect(dueMonths(rule(6, "2026-10-14"), "2026-11-06")).toEqual(["2026-11"]);
  });

  it("建立當月的日期還沒到_當月就會記", () => {
    expect(dueMonths(rule(20, "2026-10-14"), "2026-10-19")).toEqual([]);
    expect(dueMonths(rule(20, "2026-10-14"), "2026-10-20")).toEqual(["2026-10"]);
  });

  it("建立的那天就是日期_當天就會記", () => {
    expect(dueMonths(rule(14, "2026-10-14"), "2026-10-14")).toEqual(["2026-10"]);
  });

  it("建立的日期以台北時間為準（UTC 10/13 16:30 是台北 10/14）", () => {
    const lateNight: RecurringLike = { dayOfMonth: 13, intervalMonths: 1, startMonth: null, holidayRule: "none", lastPostedMonth: null, createdAt: new Date("2026-10-13T16:30:00Z") };

    expect(dueMonths(lateNight, "2026-10-31")).toEqual([]);
    expect(dueMonths(lateNight, "2026-11-13")).toEqual(["2026-11"]);
  });

  it("已經記到 10 月_補上 11、12 月（由舊到新）", () => {
    expect(dueMonths(rule(6, "2026-01-01", "2026-10-01"), "2026-12-10")).toEqual(["2026-11", "2026-12"]);
  });

  it("這個月已經記過_沒有要記的", () => {
    expect(dueMonths(rule(6, "2026-01-01", "2026-12-01"), "2026-12-31")).toEqual([]);
  });

  it("漏掉很多個月_最多補最近 12 個月", () => {
    expect(dueMonths(rule(1, "2025-01-01"), "2026-10-14")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("可以指定最多幾個月", () => {
    expect(dueMonths(rule(1, "2025-01-01"), "2026-10-14", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("31 日在 2 月_月底那天才記", () => {
    expect(dueMonths(rule(31, "2026-01-10", "2026-01-01"), "2026-02-27")).toEqual([]);
    expect(dueMonths(rule(31, "2026-01-10", "2026-01-01"), "2026-02-28")).toEqual(["2026-02"]);
  });

  it("跨年_照月份順序", () => {
    expect(dueMonths(rule(25, "2026-01-01", "2026-11-01"), "2027-01-25")).toEqual(["2026-12", "2027-01"]);
  });

  it("最後記的月份比今天還晚（時鐘不準）_沒有要記的", () => {
    expect(dueMonths(rule(6, "2026-01-01", "2027-03-01"), "2026-10-14")).toEqual([]);
  });
});

describe("nextRunDate（設定頁的下次日期）", () => {
  it("建立當月的日期已經過了_下次是下個月", () => {
    expect(nextRunDate(rule(6, "2026-10-14"), "2026-10-14")).toBe("2026-11-06");
  });

  it("建立當月的日期還沒到_下次是這個月", () => {
    expect(nextRunDate(rule(20, "2026-10-14"), "2026-10-14")).toBe("2026-10-20");
  });

  it("今天就是日期而且還沒記_下次是今天（排程下一次執行時記）", () => {
    expect(nextRunDate(rule(14, "2026-10-14"), "2026-10-14")).toBe("2026-10-14");
  });

  it("這個月已經記過_下次是下個月", () => {
    expect(nextRunDate(rule(6, "2026-01-01", "2026-10-01"), "2026-10-14")).toBe("2026-11-06");
  });

  it("排程漏掉的月份還沒補_下次是最舊的那一筆", () => {
    expect(nextRunDate(rule(6, "2026-01-01", "2026-09-01"), "2026-10-14")).toBe("2026-10-06");
  });

  it("31 日_下個月沒有 31 日就是月底", () => {
    expect(nextRunDate(rule(31, "2026-01-01", "2026-10-01"), "2026-10-31")).toBe("2026-11-30");
  });

  it("跨年", () => {
    expect(nextRunDate(rule(5, "2026-01-01", "2026-12-01"), "2026-12-20")).toBe("2027-01-05");
  });
});

// 假日來自人事總處的辦公日曆表 2026-10-10 國慶日是週六 10/9 補假
describe("occurrenceDate（那一期的日期：沒有那天就月底，再照假日規則調整）", () => {
  it.each<[number, HolidayRule, string, string, string]>([
    [10, "before", "2026-10", "2026-10-08", "薪水 10 日遇國慶連假 提前到週四（勞動部：發薪日遇假日可以提前）"],
    [10, "before", "2026-11", "2026-11-10", "11/10 是週二 照原日"],
    [5, "after", "2026-09", "2026-09-07", "定期定額 9/5 是週六 延後到週一（臺銀證券：扣款日遇假日順延）"],
    [5, "after", "2026-12", "2026-12-07", "12/5 是週六"],
    [31, "before", "2026-10", "2026-10-30", "10/31 是週六"],
    [30, "before", "2026-02", "2026-02-26", "2 月沒有 30 日 月底 2/28 是和平紀念日（六）2/27 補假"],
    [20, "none", "2026-12", "2026-12-20", "照原日 就算是週日"],
  ])("每月 %i 日 %s 在 %s_是 %s（%s）", (dayOfMonth, holidayRule, month, expected) => {
    expect(occurrenceDate({ dayOfMonth, holidayRule }, month)).toBe(expected);
  });
});

describe("期別：提前可能跨到上個月，期別仍是原本的月份", () => {
  const firstOfMonth = rule(1, "2026-01-01", "2026-02-01", { holidayRule: "before" });

  it("3 月 1 日（日）提前到 2/26（2/27 補假、2/28 和平紀念日）_2/26 當天就到期，期別是 3 月", () => {
    expect(dueMonths(firstOfMonth, "2026-02-25")).toEqual([]);
    expect(dueMonths(firstOfMonth, "2026-02-26")).toEqual(["2026-03"]);
    expect(pendingOccurrences(firstOfMonth, "2026-02-20")).toEqual([{ period: "2026-03", date: "2026-02-26" }]);
  });
});

describe("每幾個月一次（從 startMonth 起算）", () => {
  const power = rule(20, "2026-08-01", "2026-08-01", { intervalMonths: 2, startMonth: "2026-08-01" });

  it("每 2 個月、從 8 月開始、8 月處理過_下一期是 10/20、再下一期是 12/20", () => {
    expect(nextRunDate(power, "2026-10-15")).toBe("2026-10-20");
    expect(nextRunDate({ ...power, lastPostedMonth: "2026-10-01" }, "2026-10-21")).toBe("2026-12-20");
  });

  it("9 月不是它的期別_到 9 月底都沒有到期的", () => {
    expect(dueMonths(power, "2026-09-30")).toEqual([]);
    expect(dueMonths(power, "2026-10-20")).toEqual(["2026-10"]);
  });

  it("起始月份是 YYYY-MM 也可以（表單即時算下一期用）", () => {
    expect(nextRunDate({ ...power, startMonth: "2026-08", lastPostedMonth: null, createdAt: createdOn("2026-10-15") }, "2026-10-15")).toBe("2026-10-20");
  });

  it("改了間隔後游標不在期別上_從游標之後的第一期繼續（每 3 個月、8 月起：8、11、2 月）", () => {
    const quarterly = { ...power, intervalMonths: 3, lastPostedMonth: "2026-10-01" };

    expect(nextRunDate(quarterly, "2026-10-21")).toBe("2026-11-20");
  });

  it("每年一次_下一期是明年起始月的那一天", () => {
    const yearly = rule(15, "2026-03-01", "2026-03-01", { intervalMonths: 12, startMonth: "2026-03-01" });

    expect(nextRunDate(yearly, "2026-10-15")).toBe("2027-03-15");
  });

  it("起始月份早於建立的日期_建立之前的期別不算", () => {
    const backdated = rule(5, "2026-10-14", null, { intervalMonths: 2, startMonth: "2026-08-01" });

    expect(dueMonths(backdated, "2026-10-31")).toEqual([]);
    expect(nextRunDate(backdated, "2026-10-14")).toBe("2026-12-05");
  });
});

describe("pendingOccurrences（待處理：已到期的加上 7 天內會到的，由舊到新）", () => {
  it("游標在 8 月、每月 5 日_今天 10/15 時 9 月與 10 月都到期了（11/5 還在 7 天以外）", () => {
    expect(pendingOccurrences(rule(5, "2026-08-01", "2026-08-01"), "2026-10-15")).toEqual([
      { period: "2026-09", date: "2026-09-05" },
      { period: "2026-10", date: "2026-10-05" },
    ]);
  });

  it("7 天內才出現：每月 20 日 今天 10/13 有、10/12 還沒有", () => {
    const monthly = rule(20, "2026-08-01", "2026-09-01");

    expect(pendingOccurrences(monthly, "2026-10-13")).toEqual([{ period: "2026-10", date: "2026-10-20" }]);
    expect(pendingOccurrences(monthly, "2026-10-12")).toEqual([]);
  });

  it("沒處理的期別超過 12 期_全部列出不會略過最舊的（從 2025-01 到 2026-10 共 22 期）", () => {
    const backlog = rule(5, "2025-01-01");

    const pending = pendingOccurrences(backlog, "2026-10-15");

    expect(pending).toHaveLength(22);
    expect([pending[0], pending.at(-1)]).toEqual([
      { period: "2025-01", date: "2025-01-05" },
      { period: "2026-10", date: "2026-10-05" },
    ]);
    expect(nextRunDate(backlog, "2026-10-15")).toBe("2025-01-05");
  });

  it("假日調整後的日期才算：薪水 10 日提前 10 月那一期在 10/1 就出現（10/8 減 7 天）", () => {
    const salary = rule(10, "2026-08-01", "2026-09-01", { holidayRule: "before" });

    expect(pendingOccurrences(salary, "2026-09-30")).toEqual([]);
    expect(pendingOccurrences(salary, "2026-10-01")).toEqual([{ period: "2026-10", date: "2026-10-08" }]);
  });
});

describe("previousOccurrenceMonth（刪除確認來的紀錄時游標退回前一期）", () => {
  it.each([
    [1, null, "2026-10", "2026-09"],
    [2, "2026-08-01", "2026-10", "2026-08"],
    [2, "2026-08-01", "2026-11", "2026-10"],
    [3, "2026-08-01", "2027-02", "2026-11"],
  ] as const)("每 %i 個月、從 %s 開始的 %s_前一期是 %s", (intervalMonths, startMonth, month, expected) => {
    expect(previousOccurrenceMonth(rule(5, "2026-01-01", null, { intervalMonths, startMonth }), month)).toBe(expected);
  });

  it("第一期_退回 null（還沒處理過）", () => {
    expect(previousOccurrenceMonth(rule(5, "2026-01-01", null, { intervalMonths: 2, startMonth: "2026-08-01" }), "2026-08")).toBeNull();
    expect(previousOccurrenceMonth(rule(5, "2026-03-14"), "2026-03")).toBeNull();
  });
});

describe("scheduleText（設定頁的排程文字）", () => {
  it.each([
    [{ dayOfMonth: 10, intervalMonths: 1, holidayRule: "before", mode: "confirm" }, "每月 10 日 · 遇假日提前 · 到期請我確認"],
    [{ dayOfMonth: 5, intervalMonths: 2, holidayRule: "none", mode: "auto" }, "每 2 個月 5 日 · 自動記帳"],
  ] as const)("%j_%s（SPEC 的例子）", (fields, expected) => {
    expect(scheduleText({ ...fields, startMonth: "2026-08-01", createdAt: createdOn("2026-08-01") })).toBe(expected);
  });
});

describe("recurringTitle（待處理與通知的名稱）", () => {
  const names = { accounts: new Map([[1, "台銀"], [2, "臺銀證券"]]), categories: new Map([[7, "訂閱"]]), holdingSymbols: new Map([[3, "006208"]]) };
  const base = { name: null, kind: "expense" as const, accountId: 1, counterAccountId: null, categoryId: null, holdingId: null, note: null };

  it("有名稱用名稱", () => {
    expect(recurringTitle({ ...base, name: "Netflix", categoryId: 7 }, names)).toBe("Netflix");
  });

  it("沒取名的舊資料照紀錄的寫法：分類、備註、都沒有是未分類；轉帳寫兩個帳戶；定期定額寫哪一檔", () => {
    expect(recurringTitle({ ...base, categoryId: 7, note: "影音" }, names)).toBe("訂閱");
    expect(recurringTitle({ ...base, note: "影音" }, names)).toBe("影音");
    expect(recurringTitle(base, names)).toBe("未分類");
    expect(recurringTitle({ ...base, kind: "transfer", counterAccountId: 2 }, names)).toBe("台銀 → 臺銀證券");
    expect(recurringTitle({ ...base, kind: "transfer", counterAccountId: 2, holdingId: 3 }, names)).toBe("006208 定期定額");
  });
});
