import { describe, expect, it } from "vitest";
import { cronTasks } from "./cron";

describe("排程清單", () => {
  it("通知紀錄清理與重新加密都已登記（vercel.json 依這些名稱呼叫）", () => {
    expect(Object.keys(cronTasks)).toEqual(
      expect.arrayContaining(["twitch:cleanup", "youtube:cleanup", "starrail:cleanup", "starrail:reencrypt", "youtube:reencrypt"]),
    );
  });
});
