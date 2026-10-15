import { describe, expect, it } from "vitest";
import { dueMonths, nextRunDate, scheduledDate, type RecurringLike } from "./recurring";

/** 台北時間那天中午建立 */
const createdOn = (date: string) => new Date(`${date}T04:00:00Z`);
const rule = (dayOfMonth: number, created: string, lastPostedMonth: string | null = null): RecurringLike => ({ dayOfMonth, lastPostedMonth, createdAt: createdOn(created) });

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
    const lateNight: RecurringLike = { dayOfMonth: 13, lastPostedMonth: null, createdAt: new Date("2026-10-13T16:30:00Z") };

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
