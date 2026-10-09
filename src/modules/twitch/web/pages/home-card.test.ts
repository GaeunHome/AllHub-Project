import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedStreamers", "cachedStreamerProfiles", "cachedLiveStreams", "cachedGameArt");
const { LiveNow } = await import("./home-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const html = async () => renderToStaticMarkup((await LiveNow()) as ReactElement);

const streamer = (id: number, login: string, isLive: boolean) => ({
  id,
  broadcasterId: String(1000 + id),
  login,
  displayName: login.toUpperCase(),
  profileImageUrl: `https://static-cdn.jtvnw.net/jtv_user_pictures/${login}-db.png`,
  onlineSubscriptionId: null,
  offlineSubscriptionId: null,
  subscriptionStatus: "enabled",
  isLive,
  notifyEnabled: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
});

const liveStream = (userId: string, login: string) => ({
  userId,
  title: "今天玩鐵道",
  gameId: "1351906",
  gameName: "Honkai: Star Rail",
  viewerCount: 1234,
  startedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
  previewUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg`,
});

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedStreamers.mockReset().mockResolvedValue([]);
  // 預設是沒有 Twitch 憑證：Helix 的快取函式都回 null
  cached.cachedStreamerProfiles.mockReset().mockResolvedValue(null);
  cached.cachedLiveStreams.mockReset().mockResolvedValue(null);
  cached.cachedGameArt.mockReset().mockResolvedValue(null);
});

describe("首頁「正在直播」（Twitch）", () => {
  it("用登入者的 id 讀追蹤的主播：每個人只看到自己追蹤的", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedStreamers).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒追蹤任何主播_空狀態連到 Twitch 頁，不必查 Helix", async () => {
    const markup = await html();

    expect(textOf(markup)).toContain("還沒有追蹤任何主播");
    expect(markup).toContain('href="/twitch"');
    expect(cached.cachedLiveStreams).not.toHaveBeenCalled();
  });

  it("有追蹤但沒人在直播_簡短的空狀態", async () => {
    cached.cachedStreamers.mockResolvedValue([streamer(1, "alice", false)]);
    cached.cachedStreamerProfiles.mockResolvedValue([]);
    cached.cachedLiveStreams.mockResolvedValue([]);

    const text = textOf(await html());

    expect(text).toContain("目前沒有追蹤的主播在直播");
    expect(text).not.toContain("ALICE");
  });

  it("Helix 查得到直播_頭像、預覽圖、觀看人數、開台多久、遊戲名稱，點了在新分頁開 Twitch；離線的不列", async () => {
    cached.cachedStreamers.mockResolvedValue([streamer(1, "alice", false), streamer(2, "bob", false)]);
    cached.cachedStreamerProfiles.mockResolvedValue([{ id: "1001", profileImageUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/alice-helix.png", offlineImageUrl: null }]);
    cached.cachedLiveStreams.mockResolvedValue([liveStream("1001", "alice")]);
    cached.cachedGameArt.mockResolvedValue([{ id: "1351906", boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/1351906-72x96.jpg" }]);

    const markup = await html();
    const text = textOf(markup);

    expect(markup).toMatch(/<a[^>]*href="https:\/\/twitch\.tv\/alice"[^>]*target="_blank"|<a[^>]*target="_blank"[^>]*href="https:\/\/twitch\.tv\/alice"/);
    expect(markup).toContain("live_user_alice-640x360.jpg");
    expect(markup).toContain("alice-helix.png");
    expect(text).toContain("ALICE");
    expect(text).toContain("1,234 人觀看");
    expect(text).toContain("開台 1 小時 35 分");
    expect(text).toContain("Honkai: Star Rail");
    expect(text).not.toContain("BOB");
    // 跟 Twitch 頁用同一組 id（排序過），共用同一份快取
    expect(cached.cachedLiveStreams).toHaveBeenCalledWith(["1001", "1002"]);
  });

  it("沒有 Twitch 憑證（Helix 都是 null）_照 EventSub 記下的開台狀態列出直播中的主播，用資料庫存的頭像，不顯示錯誤", async () => {
    cached.cachedStreamers.mockResolvedValue([streamer(1, "alice", true), streamer(2, "bob", false)]);

    const markup = await html();
    const text = textOf(markup);

    expect(text).toContain("ALICE");
    expect(text).toContain("直播中");
    expect(markup).toContain("alice-db.png");
    expect(markup).toContain('href="https://twitch.tv/alice"');
    expect(text).not.toContain("BOB");
    expect(text).not.toMatch(/錯誤|失敗/);
  });

  it("直播中的超過 4 位_只列 4 位，其餘說明人數並連到 Twitch 頁", async () => {
    cached.cachedStreamers.mockResolvedValue(["aa", "bb", "cc", "dd", "ee", "ff"].map((login, i) => streamer(i + 1, login, true)));

    const markup = await html();

    expect(markup.match(/href="https:\/\/twitch\.tv\/[a-z]+"/g)).toHaveLength(4);
    expect(textOf(markup)).toContain("還有 2 位正在直播");
    expect(markup).toContain('href="/twitch"');
  });
});
