import { revalidateTag, updateTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { expireTags, expiringTask, updateTags } from "./cache";

describe("updateTags（Server Action 用）", () => {
  it("每個 tag 各呼叫一次 updateTag_不用 revalidateTag", () => {
    updateTags("twitch:streamers", "twitch:events");

    expect(vi.mocked(updateTag).mock.calls).toEqual([["twitch:streamers"], ["twitch:events"]]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("expireTags（Route Handler、排程、after() 用）", () => {
  it("每個 tag 用 revalidateTag 的 expire: 0：下一個請求直接讀新資料，不先給舊的", () => {
    expireTags("youtube:videos", "core:notifications");

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ["youtube:videos", { expire: 0 }],
      ["core:notifications", { expire: 0 }],
    ]);
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("expiringTask（排程登記用）", () => {
  it("成功_回傳原本的摘要_之後才讓 tag 失效", async () => {
    const order: string[] = [];
    const task = expiringTask(async () => {
      order.push("task");
      return "刪除 3 筆";
    }, "twitch:events");
    vi.mocked(revalidateTag).mockImplementation(() => void order.push("expire"));

    await expect(task()).resolves.toBe("刪除 3 筆");
    expect(order).toEqual(["task", "expire"]);
    expect(revalidateTag).toHaveBeenCalledWith("twitch:events", { expire: 0 });
  });

  it("中途失敗_仍讓 tag 失效（失敗前可能已寫入一部分）_錯誤照樣丟出給 runCron 記錄", async () => {
    const task = expiringTask(async () => {
      throw new Error("Twitch API 失敗");
    }, "twitch:streamers");

    await expect(task()).rejects.toThrow("Twitch API 失敗");
    expect(revalidateTag).toHaveBeenCalledWith("twitch:streamers", { expire: 0 });
  });

  it("包起來之前不執行：登記排程時不能就先跑一次", () => {
    const work = vi.fn(async () => "ok");

    expiringTask(work, "starrail:accounts");

    expect(work).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
