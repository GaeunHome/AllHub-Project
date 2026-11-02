import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { insertItem, itemsOf } from "../dev/fixtures";

// 程式漏檢查時資料庫也會擋 約束跟 lib 的驗證是同一套規則

const getDb = setupTestDb();
let me: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice");
});

const withDays = (notifyDaysBefore: number | null) => insertItem(getDb(), me, { date: "2026-11-30", notifyDaysBefore });

describe("通知天數（reminders_items_notify_days）", () => {
  it.each([2, 4, 15, 31, -1, 365])("不在選項裡的 %i 寫不進去：什麼都沒有存", async (days) => {
    // drizzle 把資料庫錯誤包在 cause 裡 確認是這個約束擋下
    await expect(withDays(days)).rejects.toMatchObject({ cause: { constraint: "reminders_items_notify_days" } });

    expect(await itemsOf(getDb(), me)).toEqual([]);
  });

  it("當天、前 1／3／7／14／30 天都寫得進去", async () => {
    for (const days of [0, 1, 3, 7, 14, 30]) await withDays(days);

    expect((await itemsOf(getDb(), me)).map((item) => item.notifyDaysBefore)).toEqual([0, 1, 3, 7, 14, 30]);
  });

  it("null 是不通知，寫得進去", async () => {
    await withDays(null);

    expect((await itemsOf(getDb(), me))[0].notifyDaysBefore).toBeNull();
  });
});
