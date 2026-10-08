import { updateTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv, stubTwitchEnv, stubYoutubeEnv } from "@/dev/test-env";
import { expiredTags } from "@/dev/test-helpers";

stubCoreEnv();
stubTwitchEnv();
stubYoutubeEnv();

const { cronTasks } = await import("./cron");

setupTestDb();

/** 排程 → 執行後要失效的 tag；新增排程時這張表也要加，否則下面的「每個排程都在表上」會失敗 */
const EXPECTED: Record<string, string[]> = {
  "twitch:sync": ["twitch:streamers"],
  "twitch:cleanup": ["twitch:events"],
  "youtube:renew": ["youtube:channels"],
  "youtube:cleanup": ["youtube:videos"],
  "youtube:reencrypt": ["youtube:settings"],
  "starrail:checkin": ["starrail:accounts", "starrail:checkins"],
  "starrail:stamina": ["starrail:accounts"],
  "starrail:cleanup": ["starrail:checkins"],
  "starrail:reencrypt": ["starrail:accounts"],
};

beforeEach(() => {
  // 測試不能打到真的 Twitch／YouTube：需要連線的排程會在這裡失敗
  vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new Error("offline"))).impl);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
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
