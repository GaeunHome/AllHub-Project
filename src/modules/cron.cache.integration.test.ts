import { updateTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { setupTestDb } from "@/dev/test-db";
import { stubAllEnv } from "@/dev/test-env";
import { expiredTags } from "@/dev/test-helpers";

stubAllEnv();

const { cronTasks } = await import("./cron");

setupTestDb();

/**
 * 排程執行後要失效的 tag
 * 新增排程時這張表也要加 不然每個排程都在表上的測試會失敗
 */
const EXPECTED: Record<string, string[]> = {
  "twitch:sync": ["twitch:streamers"],
  "twitch:cleanup": ["twitch:events"],
  "youtube:renew": ["youtube:channels"],
  // 只刪影片 翻譯永久保留
  "youtube:cleanup": ["youtube:videos"],
  "youtube:reencrypt": ["youtube:settings"],
  // 星穹鐵道帳號的 tag 標著所有 HoYoLAB 的快取 只在帳號那一列真的改了才失效
  // 這裡是空的資料庫 什麼都沒改
  "starrail:checkin": ["starrail:checkins"],
  "starrail:stamina": [],
  "starrail:cleanup": ["starrail:checkins"],
  "starrail:reencrypt": [],
  "starrail:redeem": [],
  // 自動記的紀錄改了餘額與統計 固定收支記到的月份也往前推
  // 到期通知認領信用卡寄到哪一天
  "savings:recurring": ["savings:accounts", "savings:bills", "savings:recurring", "savings:transactions"],
  // 只寫通知與認領紀錄 通知的 tag 由 notify 自己失效
  "weather:rain": [],
};

beforeEach(() => {
  // 測試不能打到真的 Twitch 與 YouTube 需要連線的排程會在這裡失敗
  vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new Error("offline"))).impl);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("排程執行後讓 tag 失效（revalidateTag，expire: 0）", () => {
  it("每個排程都在對照表上", () => {
    expect(Object.keys(cronTasks).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))("%s → %j", async (name, tags) => {
    await cronTasks[name]().catch(() => undefined);

    expect(expiredTags()).toEqual([...tags].sort());
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("排程中途失敗（連不到 Twitch）_仍讓 tag 失效_錯誤照樣丟給 runCron", async () => {
    await expect(cronTasks["twitch:sync"]()).rejects.toThrow();

    expect(expiredTags()).toEqual(["twitch:streamers"]);
  });
});
