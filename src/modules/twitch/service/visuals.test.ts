import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubTwitchEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf, tagged } from "@/dev/test-helpers";

vi.mock("../lib/api", { spy: true });

stubTwitchEnv();

const api = mocksOf(await import("../lib/api"), "getUsersById", "getLiveStreams", "getGames");
const { TwitchApiError } = await import("../lib/api");
const { cachedGameArt, cachedLiveStreams, cachedStreamerProfiles } = await import("./cached");

beforeEach(() => {
  api.getUsersById.mockReset().mockResolvedValue([
    { id: "1", login: "alice", display_name: "Alice", profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/alice-300x300.png", offline_image_url: "" },
  ]);
  api.getLiveStreams.mockReset().mockResolvedValue([
    { user_id: "1", title: "早安", game_id: "99", game_name: "Just Chatting", viewer_count: 12, started_at: "2026-10-08T10:00:00Z", thumbnail_url: "https://p/{width}x{height}.jpg" },
  ]);
  api.getGames.mockReset().mockResolvedValue([{ id: "99", name: "Just Chatting", box_art_url: "https://b/99-{width}x{height}.jpg" }]);
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

  it("沒有主播_空陣列", async () => {
    api.getUsersById.mockResolvedValue([]);

    expect(await cachedStreamerProfiles([])).toEqual([]);
  });
});

describe("cachedLiveStreams：直播狀態、觀看人數與預覽圖", () => {
  it("效期 2 分鐘（live）_也標 twitch:streamers：EventSub 寫入開關台時一起重抓", async () => {
    expect(await cachedLiveStreams(["1"])).toEqual([
      { userId: "1", title: "早安", gameId: "99", gameName: "Just Chatting", viewerCount: 12, startedAt: "2026-10-08T10:00:00Z", previewUrl: "https://p/640x360.jpg" },
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
