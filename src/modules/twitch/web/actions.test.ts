import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/streamers", { spy: true });

const service = mocksOf(await import("../service/streamers"), "setStreamerNotify", "addStreamer", "syncSubscriptionsFor", "removeStreamer");
const { addStreamerAction, removeStreamerAction, setStreamerNotifyAction, syncAction } = await import("./actions");

beforeEach(() => {
  requireSession.mockReset();
  service.setStreamerNotify.mockReset().mockResolvedValue(true);
  service.addStreamer.mockReset().mockResolvedValue({ displayName: "Alice" });
  service.syncSubscriptionsFor.mockReset().mockResolvedValue("已同步你追蹤的 1 位主播，1 位訂閱正常");
  service.removeStreamer.mockReset().mockResolvedValue({});
});

describe("加入主播與同步訂閱：非預期錯誤顯示在表單上（不會跳錯誤畫面）", () => {
  it("加入主播時資料庫出錯_回摘要不丟例外_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    service.addStreamer.mockRejectedValue(Object.assign(new Error('Failed query: insert into "twitch_streamers" params: secret-detail'), { name: "DrizzleQueryError" }));

    expect(await addStreamerAction({}, form({ login: "alice" }))).toEqual({ error: "加入主播失敗（詳見伺服器 log）" });
    expect(loggedText(log)).toContain("DrizzleQueryError");
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("同步訂閱時 Twitch 沒回應（逾時）_回摘要不丟例外", async () => {
    const log = captureErrorLog();
    service.syncSubscriptionsFor.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    expect(await syncAction()).toEqual({ error: "同步訂閱失敗（詳見伺服器 log）" });
    expect(loggedText(log)).toContain("TimeoutError");
  });
});

describe("setStreamerNotifyAction", () => {
  it("先檢查登入_沒登入時不改設定", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(setStreamerNotifyAction({}, form({ id: "3", enabled: "false" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(service.setStreamerNotify).not.toHaveBeenCalled();
  });

  it.each([
    ["false", false],
    ["true", true],
  ])("enabled=%s_存成 %s 並重新整理畫面", async (raw, enabled) => {
    expect(await setStreamerNotifyAction({}, form({ id: "3", enabled: raw }))).toEqual({});

    expect(service.setStreamerNotify).toHaveBeenCalledWith(TEST_SESSION.id, 3, enabled);
    expect(updateTag).toHaveBeenCalledWith("twitch:follows");
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["id 不是數字", { id: "abc", enabled: "true" }],
    ["id 不是正整數", { id: "0", enabled: "true" }],
    ["enabled 不是 true/false", { id: "3", enabled: "yes" }],
  ])("%s_回錯誤、不改設定", async (_name, fields) => {
    expect((await setStreamerNotifyAction({}, form(fields))).error).toBeTruthy();
    expect(service.setStreamerNotify).not.toHaveBeenCalled();
  });

  it("主播已經被刪除_提示重新整理", async () => {
    service.setStreamerNotify.mockResolvedValue(false);

    expect(await setStreamerNotifyAction({}, form({ id: "3", enabled: "false" }))).toEqual({ error: "找不到這位主播，請重新整理頁面" });
  });

  it("資料庫出錯_回摘要_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    service.setStreamerNotify.mockRejectedValue(Object.assign(new Error("update twitch_streamers secret-detail"), { name: "DrizzleQueryError" }));

    expect(await setStreamerNotifyAction({}, form({ id: "3", enabled: "false" }))).toEqual({ error: "變更通知設定失敗（詳見伺服器 log）" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("DrizzleQueryError");
  });
});

describe("擁有權：一律用登入者的 id 呼叫 service", () => {
  it.each([
    ["addStreamerAction", () => addStreamerAction({}, form({ login: "alice" })), "addStreamer"],
    ["removeStreamerAction", () => removeStreamerAction({}, form({ id: "3" })), "removeStreamer"],
    ["setStreamerNotifyAction", () => setStreamerNotifyAction({}, form({ id: "3", enabled: "false" })), "setStreamerNotify"],
    // 冷卻時間依登入者計算，回應也只說他自己追蹤的主播
    ["syncAction", () => syncAction(), "syncSubscriptionsFor"],
  ] as const)("%s_帶的是登入者（bob）的 id", async (_name, run, method) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await run();

    expect(service[method].mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });
});
