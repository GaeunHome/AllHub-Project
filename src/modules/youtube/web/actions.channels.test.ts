import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });

const channels = mocksOf(await import("../service/channels"), "setChannelNotify");
const { setChannelNotifyAction } = await import("./actions");


beforeEach(() => {
  requireSession.mockReset();
  channels.setChannelNotify.mockReset().mockResolvedValue(true);
});

describe("setChannelNotifyAction", () => {
  it("先檢查登入_沒登入時不改設定", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(channels.setChannelNotify).not.toHaveBeenCalled();
  });

  it("關掉通知_存起來並重新整理畫面", async () => {
    expect(await setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))).toEqual({});

    expect(channels.setChannelNotify).toHaveBeenCalledWith(TEST_SESSION.id, 2, false);
    expect(updateTag).toHaveBeenCalledWith("youtube:follows");
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["id 不正確", { id: "-1", enabled: "true" }],
    ["enabled 不正確", { id: "2", enabled: "on" }],
  ])("%s_回錯誤、不改設定", async (_name, fields) => {
    expect((await setChannelNotifyAction({}, form(fields))).error).toBeTruthy();
    expect(channels.setChannelNotify).not.toHaveBeenCalled();
  });

  it("頻道已被刪除_提示重新整理", async () => {
    channels.setChannelNotify.mockResolvedValue(false);

    expect(await setChannelNotifyAction({}, form({ id: "2", enabled: "true" }))).toEqual({ error: "找不到這個頻道，請重新整理頁面" });
  });

  it("資料庫出錯_回摘要_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    channels.setChannelNotify.mockRejectedValue(Object.assign(new Error("secret-detail"), { name: "DrizzleQueryError" }));

    expect(await setChannelNotifyAction({}, form({ id: "2", enabled: "true" }))).toEqual({ error: "變更通知設定失敗（詳見伺服器 log）" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
  });
});
