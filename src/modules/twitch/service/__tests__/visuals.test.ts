import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubTwitchEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf, tagged } from "@/dev/test-helpers";

vi.mock("../../lib/api", { spy: true });

stubTwitchEnv();

const api = mocksOf(await import("../../lib/api"), "getUsersById", "getLiveStreams", "getGames", "getSchedule");
const { TwitchApiError } = await import("../../lib/api");
const { cachedGameArt, cachedLiveStreams, cachedSchedule, cachedStreamerProfiles } = await import("../cached");

beforeEach(() => {
  api.getUsersById.mockReset().mockResolvedValue([
    { id: "1", login: "alice", display_name: "Alice", profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/alice-300x300.png", offline_image_url: "" },
  ]);
  api.getLiveStreams.mockReset().mockResolvedValue([
    { user_id: "1", title: "早安", game_id: "99", game_name: "Just Chatting", viewer_count: 12, started_at: "2026-10-08T10:00:00Z", thumbnail_url: "https://p/{width}x{height}.jpg" },
  ]);
  api.getGames.mockReset().mockResolvedValue([{ id: "99", name: "Just Chatting", box_art_url: "https://b/99-{width}x{height}.jpg" }]);
  api.getSchedule.mockReset().mockResolvedValue({ data: { segments: [{ id: "s", start_time: "2026-11-13T12:00:00Z", end_time: "2026-11-13T15:00:00Z", title: "聊天", canceled_until: null, category: null, is_recurring: true }], vacation: null } });
});

describe("cachedStreamerProfiles：主播頭像與離線橫幅（外部資料，不存資料庫）", () => {
  it("參數是主播 id_只留畫面用得到的欄位_標 twitch:external_效期一天", async () => {
    expect(await cachedStreamerProfiles(["1"])).toEqual([
      { id: "1", profileImageUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/alice-300x300.png", offlineImageUrl: null },
    ]);
    expect(api.getUsersById).toHaveBeenCalledWith(["1"]);
    expect(tagged()).toEqual(["twitch:external"]);
    expect(cacheLife).toHaveBeenCalledWith("avatar");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("還沒設定 Twitch 憑證_null_不呼叫 Helix、不丟錯", async () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "");

    expect(await cachedStreamerProfiles(["1"])).toBeNull();
    expect(api.getUsersById).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    stubTwitchEnv();
  });

  it("Helix 出錯_null_短效期；log 只記錯誤種類與狀態碼，不記回應原文", async () => {
    const log = captureErrorLog();
    api.getUsersById.mockRejectedValue(new TwitchApiError(401, "GET /users失敗（401）：invalid client secret xyz"));

    expect(await cachedStreamerProfiles(["1"])).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).toContain("TwitchApiError");
    expect(loggedText(log)).toContain("401");
    expect(loggedText(log)).not.toContain("invalid client secret");
  });
});

describe("cachedLiveStreams：直播狀態、觀看人數與預覽圖", () => {
  it("效期 2 分鐘（live）_也標 twitch:streamers：EventSub 寫入開關台時一起重抓", async () => {
    expect(await cachedLiveStreams(["1"])).toEqual([
      {
        userId: "1",
        title: "早安",
        gameId: "99",
        gameName: "Just Chatting",
        viewerCount: 12,
        startedAt: "2026-10-08T10:00:00Z",
        previewUrl: "https://p/640x360.jpg",
        largePreviewUrl: "https://p/1920x1080.jpg",
      },
    ]);
    expect(tagged()).toEqual(["twitch:external", "twitch:streamers"]);
    expect(cacheLife).toHaveBeenCalledWith("live");
  });

  it("還沒設定憑證_null", async () => {
    vi.stubEnv("TWITCH_CLIENT_SECRET", "");

    expect(await cachedLiveStreams(["1"])).toBeNull();
    expect(api.getLiveStreams).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    stubTwitchEnv();
  });
});

describe("cachedGameArt：遊戲封面", () => {
  it("封面換成實際尺寸_效期一天", async () => {
    expect(await cachedGameArt(["99"])).toEqual([{ id: "99", boxArtUrl: "https://b/99-72x96.jpg" }]);
    expect(tagged()).toEqual(["twitch:external"]);
    expect(cacheLife).toHaveBeenCalledWith("avatar");
  });
});

describe("cachedSchedule：主播的開台時間表（使用者選的清單＋詳情）", () => {
  it("一位主播一份，標 twitch:external，15 分鐘後背景重讀、很久沒看時先給最多 6 小時前的（schedule）", async () => {
    expect(await cachedSchedule("1")).toEqual({ configured: true, schedule: { segments: [{ start: "2026-11-13T12:00:00.000Z", end: "2026-11-13T15:00:00.000Z", title: "聊天", category: null }], vacation: null } });
    expect(api.getSchedule).toHaveBeenCalledWith("1");
    expect(tagged()).toEqual(["twitch:external"]);
    expect(cacheLife).toHaveBeenCalledWith("schedule");
  });

  it("主播沒有設定時間表（Twitch 回 404，getSchedule 回 null）：空的，不算讀不到", async () => {
    api.getSchedule.mockResolvedValue(null);

    expect(await cachedSchedule("1")).toEqual({ configured: true, schedule: { segments: [], vacation: null } });
    expect(cacheLife).toHaveBeenCalledWith("schedule");
  });

  it("Helix 出錯或格式不同：schedule 是 null，短效期，log 不記回應原文", async () => {
    const log = captureErrorLog();
    api.getSchedule.mockRejectedValue(new TwitchApiError(500, "GET /schedule失敗（500）：secret stuff"));

    expect(await cachedSchedule("1")).toEqual({ configured: true, schedule: null });
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).not.toContain("secret stuff");

    api.getSchedule.mockResolvedValue({ message: "unexpected" });
    expect((await cachedSchedule("2")).schedule).toBeNull();
  });

  it("還沒設定 Twitch 憑證：不呼叫 Helix，畫面不顯示時間表", async () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "");

    expect(await cachedSchedule("1")).toEqual({ configured: false, schedule: null });
    expect(api.getSchedule).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    stubTwitchEnv();
  });
});
