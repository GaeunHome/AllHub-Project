import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });
vi.mock("../service/caption-status", { spy: true });

const channels = mocksOf(await import("../service/channels"), "setChannelNotify");
const captions = mocksOf(await import("../service/caption-status"), "checkChineseCaptions");
const { recheckCaptionsAction, setChannelNotifyAction } = await import("./actions");

const VIDEO = "dQw4w9WgXcQ";

beforeEach(() => {
  requireSession.mockReset();
  channels.setChannelNotify.mockReset().mockResolvedValue(true);
  captions.checkChineseCaptions.mockReset().mockResolvedValue("no");
});

describe("setChannelNotifyAction", () => {
  it("先檢查登入_沒登入時不改設定", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(channels.setChannelNotify).not.toHaveBeenCalled();
  });

  it("關掉通知_存起來並重新整理畫面", async () => {
    expect(await setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))).toEqual({});

    expect(channels.setChannelNotify).toHaveBeenCalledWith(2, false);
    expect(updateTag).toHaveBeenCalledWith("youtube:channels");
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

describe("recheckCaptionsAction（手動重新檢查中文字幕）", () => {
  it("先檢查登入", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(recheckCaptionsAction({}, form({ videoId: VIDEO }))).rejects.toThrow("NEXT_REDIRECT");
    expect(captions.checkChineseCaptions).not.toHaveBeenCalled();
  });

  it.each([
    ["yes", "有中文字幕了，可以直接在 YouTube 看"],
    ["no", "還沒有中文字幕，可以用翻譯觀看"],
    ["unknown", "無法確認是否有中文字幕（YouTube 可能擋下了請求），晚點再試"],
  ])("結果是 %s_回對應的說明並重新整理清單", async (status, message) => {
    captions.checkChineseCaptions.mockResolvedValue(status);

    expect(await recheckCaptionsAction({}, form({ videoId: VIDEO }))).toEqual({ message });
    expect(captions.checkChineseCaptions).toHaveBeenCalledWith(VIDEO);
    expect(updateTag).toHaveBeenCalledWith("youtube:videos");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("影片 id 格式不對_不檢查", async () => {
    expect((await recheckCaptionsAction({}, form({ videoId: "../../etc" }))).error).toBeTruthy();
    expect(captions.checkChineseCaptions).not.toHaveBeenCalled();
  });

  it("影片已經不在清單裡_回錯誤", async () => {
    captions.checkChineseCaptions.mockResolvedValue(null);

    expect(await recheckCaptionsAction({}, form({ videoId: VIDEO }))).toEqual({ error: "找不到這支影片，請重新整理頁面" });
  });

  it("出錯_回摘要_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    captions.checkChineseCaptions.mockRejectedValue(Object.assign(new Error("secret-detail"), { name: "DrizzleQueryError" }));

    expect(await recheckCaptionsAction({}, form({ videoId: VIDEO }))).toEqual({ error: "重新檢查失敗（詳見伺服器 log）" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
  });
});
