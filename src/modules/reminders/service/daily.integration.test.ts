import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimKey } from "@/core/claim";
import { coreNotifications, coreRateLimits, coreUsers } from "@/core/db/schema";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { insertItem, itemsOf } from "../dev/fixtures";

vi.mock("@/core/notify", { spy: true });

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { sendDailyReminders } = await import("./daily");

const getDb = setupTestDb();

// 排程在 UTC 23 點與 4 點跑 這裡是台北 11/2 早上 7 點 10 分 UTC 還是 11/1
const MORNING = new Date("2026-11-01T23:10:00Z");
// 同一天中午 12 點 10 分那一次
const NOON = new Date("2026-11-02T04:10:00Z");
const TODAY = "2026-11-02";
const YESTERDAY = "2026-11-01";
const DAY = 86_400_000;
const morningAfter = (days: number) => new Date(MORNING.getTime() + days * DAY);

let alice: string;
let bob: string;

const notificationsOf = (userId: string) =>
  getDb()
    .select({ module: coreNotifications.module, kind: coreNotifications.kind, title: coreNotifications.title, body: coreNotifications.body, url: coreNotifications.url })
    .from(coreNotifications)
    .where(eq(coreNotifications.userId, userId))
    .orderBy(asc(coreNotifications.id));

const titlesOf = async (userId: string) => (await notificationsOf(userId)).map((notification) => notification.title);

beforeEach(async () => {
  [alice, bob] = await insertTestUsers(getDb());
  notify.mockClear();
});

describe("到日子寄提醒（reminders:daily）", () => {
  it("當天：標題「今天：<標題>」、內文寫日期、連到首頁；只寄給擁有者", async () => {
    await insertItem(getDb(), alice, { title: "繳房屋稅", date: TODAY, notifyDaysBefore: 0 });

    expect(await sendDailyReminders(MORNING)).toBe("寄出 1 則提醒");

    expect(await notificationsOf(alice)).toEqual([{ module: "reminders", kind: "due", title: "今天：繳房屋稅", body: "11/2", url: "/" }]);
    expect(await notificationsOf(bob)).toEqual([]);
  });

  it("前 1 天的提前那天寫「明天：<標題>」，跨年的內文寫出年份", async () => {
    await insertItem(getDb(), alice, { title: "跨年", date: "2027-01-01", notifyDaysBefore: 1 });

    await sendDailyReminders(new Date("2026-12-30T23:10:00Z"));

    expect(await notificationsOf(alice)).toEqual([{ module: "reminders", kind: "due", title: "明天：跨年", body: "2027/1/1", url: "/" }]);
  });

  it.each([
    [3, "2026-11-05"],
    [7, "2026-11-09"],
    [14, "2026-11-16"],
    [30, "2026-12-02"],
  ])("前 %i 天的提前那天寫「還有 N 天：<標題>」", async (days, date) => {
    await insertItem(getDb(), alice, { title: "考試", date, notifyDaysBefore: days });

    await sendDailyReminders(MORNING);

    expect(await titlesOf(alice)).toEqual([`還有 ${days} 天：考試`]);
  });

  it("提前的項目在提前那天與當天各寄一則：中間的日子不寄，當天的不會多寄", async () => {
    await insertItem(getDb(), alice, { title: "考試", date: "2026-11-05", notifyDaysBefore: 3 });
    await insertItem(getDb(), alice, { title: "看牙醫", date: "2026-11-05", notifyDaysBefore: 0 });

    for (let day = 0; day <= 3; day++) await sendDailyReminders(morningAfter(day));

    expect(await titlesOf(alice)).toEqual(["還有 3 天：考試", "今天：看牙醫", "今天：考試"]);
  });

  it("提前那天已經過了就只剩當天：今天才加、提前 7 天已經來不及的項目", async () => {
    await insertItem(getDb(), alice, { title: "考試", date: "2026-11-04", notifyDaysBefore: 7 });

    await sendDailyReminders(MORNING);
    await sendDailyReminders(morningAfter(1));
    expect(await titlesOf(alice)).toEqual([]);

    await sendDailyReminders(morningAfter(2));
    expect(await titlesOf(alice)).toEqual(["今天：考試"]);
  });

  it("不通知的項目（null）什麼時候都不寄", async () => {
    await insertItem(getDb(), alice, { date: TODAY, notifyDaysBefore: null });

    expect(await sendDailyReminders(MORNING)).toBe("今天沒有要寄或要刪的提醒");
    expect(await notificationsOf(alice)).toEqual([]);
  });

  it("同一天重跑不重複寄：照台北的日期認領，UTC 已經換日（台北早上 8 點半）也算同一天；隔天是另一件事", async () => {
    await insertItem(getDb(), alice, { title: "考試", date: "2026-11-03", notifyDaysBefore: 1 });

    expect(await sendDailyReminders(MORNING)).toBe("寄出 1 則提醒");
    expect(await sendDailyReminders(new Date(MORNING.getTime() + 30 * 60_000))).toBe("1 則今天已經寄過");
    expect(await sendDailyReminders(new Date("2026-11-02T00:30:00Z"))).toBe("1 則今天已經寄過");
    expect(await titlesOf(alice)).toEqual(["明天：考試"]);

    expect(await sendDailyReminders(morningAfter(1))).toBe("寄出 1 則提醒");
    expect(await titlesOf(alice)).toEqual(["明天：考試", "今天：考試"]);
  });

  it("認領記在 core_rate_limits：scope 是 reminders:due，key 是項目 id 與台北日期的雜湊", async () => {
    const item = await insertItem(getDb(), alice, { date: TODAY });

    await sendDailyReminders(MORNING);

    expect(await getDb().select({ scope: coreRateLimits.scope, keyHash: coreRateLimits.keyHash }).from(coreRateLimits)).toEqual([{ scope: "reminders:due", keyHash: claimKey(item.id, TODAY) }]);
  });

  it("一筆寄不出去不擋住其他筆：算進失敗數、log 只記種類、放掉認領，同一天重跑時補寄", async () => {
    // 同一天到期的後建立的先處理 所以第一次失敗的是 alice 這筆
    await insertItem(getDb(), bob, { title: "bob 的提醒", date: TODAY });
    await insertItem(getDb(), alice, { title: "秘密的標題", date: TODAY });
    notify.mockRejectedValueOnce(new Error("寫入失敗 秘密的標題"));
    const log = captureErrorLog();

    expect(await sendDailyReminders(MORNING)).toBe("寄出 1 則提醒，1 則寄不出去");

    expect(await titlesOf(alice)).toEqual([]);
    expect(await titlesOf(bob)).toEqual(["今天：bob 的提醒"]);
    expect(loggedText(log)).toContain("Error");
    expect(loggedText(log)).not.toContain("秘密的標題");
    expect(loggedText(log)).not.toContain(alice);

    expect(await sendDailyReminders(new Date(MORNING.getTime() + 30 * 60_000))).toBe("寄出 1 則提醒，1 則今天已經寄過");
    expect(await titlesOf(alice)).toEqual(["今天：秘密的標題"]);
    expect(await titlesOf(bob)).toHaveLength(1);
  });
});

describe("早上寄不出去的中午補寄", () => {
  it("07:xx 寄不出去，12:xx 寄到；早上寄到的不重複，中午寄過的再跑也不重複", async () => {
    // 同一天到期的後建立的先處理 所以第一次失敗的是 alice 這筆
    await insertItem(getDb(), bob, { title: "早上寄到了", date: TODAY });
    await insertItem(getDb(), alice, { title: "早上寄不出去", date: TODAY });
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();

    expect(await sendDailyReminders(MORNING)).toBe("寄出 1 則提醒，1 則寄不出去");
    expect(await titlesOf(alice)).toEqual([]);

    expect(await sendDailyReminders(NOON)).toBe("寄出 1 則提醒，1 則今天已經寄過");
    expect(await titlesOf(alice)).toEqual(["今天：早上寄不出去"]);
    expect(await titlesOf(bob)).toEqual(["今天：早上寄到了"]);

    expect(await sendDailyReminders(new Date(NOON.getTime() + 30 * 60_000))).toBe("2 則今天已經寄過");
    expect(await titlesOf(alice)).toHaveLength(1);
    expect(await titlesOf(bob)).toHaveLength(1);
  });

  it("提前那天的提醒一樣補寄：寫的還是當天算的天數", async () => {
    await insertItem(getDb(), alice, { title: "考試", date: "2026-11-05", notifyDaysBefore: 3 });
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();

    await sendDailyReminders(MORNING);
    await sendDailyReminders(NOON);

    expect(await titlesOf(alice)).toEqual(["還有 3 天：考試"]);
  });

  it("早上已經刪過過期的，中午再跑沒有事可做：不會多算刪除", async () => {
    await insertItem(getDb(), alice, { title: "昨天的", date: YESTERDAY, notifyDaysBefore: null });

    expect(await sendDailyReminders(MORNING)).toBe("刪除 1 個過期的提醒");
    expect(await sendDailyReminders(NOON)).toBe("今天沒有要寄或要刪的提醒");
  });
});

describe("同一天有好幾則時最急的最後寫入（通知新的在上面，首頁未讀只顯示最新 3 則）", () => {
  it("日子近的最後寫入：「今天：」排在最上面，不會被提前的提醒擠下去；只看日期，不看建立的順序", async () => {
    await insertItem(getDb(), alice, { title: "一個月後", date: "2026-12-02", notifyDaysBefore: 30 });
    await insertItem(getDb(), alice, { title: "今天的", date: TODAY });
    await insertItem(getDb(), alice, { title: "下週", date: "2026-11-09", notifyDaysBefore: 7 });
    await insertItem(getDb(), alice, { title: "明天的", date: "2026-11-03", notifyDaysBefore: 1 });

    await sendDailyReminders(MORNING);

    expect(await titlesOf(alice)).toEqual(["還有 30 天：一個月後", "還有 7 天：下週", "明天：明天的", "今天：今天的"]);
  });

  it("同一天到期的先建立的最後寫入：排在上面", async () => {
    await insertItem(getDb(), alice, { title: "先建立的", date: TODAY });
    await insertItem(getDb(), alice, { title: "後建立的", date: TODAY });

    await sendDailyReminders(MORNING);

    expect(await titlesOf(alice)).toEqual(["今天：後建立的", "今天：先建立的"]);
  });
});

describe("日期過了自動刪除（使用者的要求）", () => {
  it("刪掉日期早於今天（台北）的列：當天的留到隔天；過期的不再寄，也不管有沒有開通知", async () => {
    await insertItem(getDb(), alice, { title: "昨天的", date: YESTERDAY, notifyDaysBefore: 0 });
    await insertItem(getDb(), alice, { title: "昨天不通知的", date: YESTERDAY, notifyDaysBefore: null });
    const today = await insertItem(getDb(), alice, { title: "今天的", date: TODAY, notifyDaysBefore: null });
    const later = await insertItem(getDb(), bob, { title: "之後的", date: "2026-11-20", notifyDaysBefore: null });

    expect(await sendDailyReminders(MORNING)).toBe("刪除 2 個過期的提醒");

    expect(await itemsOf(getDb(), alice)).toEqual([today]);
    expect(await itemsOf(getDb(), bob)).toEqual([later]);
    expect(await notificationsOf(alice)).toEqual([]);

    expect(await sendDailyReminders(morningAfter(1))).toBe("刪除 1 個過期的提醒");
    expect(await itemsOf(getDb(), alice)).toEqual([]);
  });

  it("順序固定：先寄再刪，寄不出去的也不擋住刪除", async () => {
    await insertItem(getDb(), alice, { title: "今天的", date: TODAY });
    await insertItem(getDb(), alice, { title: "昨天的", date: YESTERDAY, notifyDaysBefore: null });
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();

    expect(await sendDailyReminders(MORNING)).toBe("1 則寄不出去，刪除 1 個過期的提醒");

    expect((await itemsOf(getDb(), alice)).map((item) => item.title)).toEqual(["今天的"]);
  });
});

describe("停用＝凍結", () => {
  it("擁有者停用的項目：不寄、過期的也不刪；同一天其他人照常", async () => {
    const frozenToday = await insertItem(getDb(), bob, { title: "bob 今天", date: TODAY });
    const frozenExpired = await insertItem(getDb(), bob, { title: "bob 過期", date: YESTERDAY });
    await insertItem(getDb(), alice, { title: "alice 今天", date: TODAY });
    await insertItem(getDb(), alice, { title: "alice 過期", date: YESTERDAY });
    await getDb().update(coreUsers).set({ disabledAt: MORNING }).where(eq(coreUsers.id, bob));

    expect(await sendDailyReminders(MORNING)).toBe("寄出 1 則提醒，刪除 1 個過期的提醒");

    expect(await notificationsOf(bob)).toEqual([]);
    expect(await itemsOf(getDb(), bob)).toEqual([frozenToday, frozenExpired]);
    expect(await titlesOf(alice)).toEqual(["今天：alice 今天"]);
    expect((await itemsOf(getDb(), alice)).map((item) => item.title)).toEqual(["alice 今天"]);
  });

  it("恢復後的下一次排程才處理：沒認領過的當天項目照寄、過期的刪掉", async () => {
    await insertItem(getDb(), bob, { title: "bob 今天", date: TODAY });
    await insertItem(getDb(), bob, { title: "bob 過期", date: YESTERDAY });
    await getDb().update(coreUsers).set({ disabledAt: MORNING }).where(eq(coreUsers.id, bob));
    await sendDailyReminders(MORNING);

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, bob));
    expect(await sendDailyReminders(new Date(MORNING.getTime() + 30 * 60_000))).toBe("寄出 1 則提醒，刪除 1 個過期的提醒");

    expect(await titlesOf(bob)).toEqual(["今天：bob 今天"]);
    expect((await itemsOf(getDb(), bob)).map((item) => item.title)).toEqual(["bob 今天"]);
  });
});

describe("摘要", () => {
  it("只有數字：不寫標題與使用者", async () => {
    await insertItem(getDb(), alice, { title: "秘密的標題", date: TODAY });
    await insertItem(getDb(), bob, { title: "別人的秘密", date: YESTERDAY });

    const summary = await sendDailyReminders(MORNING);

    expect(summary).toBe("寄出 1 則提醒，刪除 1 個過期的提醒");
    for (const secret of ["秘密", alice, bob, "alice", "bob"]) expect(summary).not.toContain(secret);
  });

  it("沒有事的時候也回一句話：排程的回應不會是空的", async () => {
    expect(await sendDailyReminders(MORNING)).toBe("今天沒有要寄或要刪的提醒");
  });
});
