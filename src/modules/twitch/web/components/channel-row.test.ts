import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ removeStreamerAction: vi.fn(), setStreamerNotifyAction: vi.fn() }));

const { ChannelRow, ChannelDetail } = await import("./channel-row");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

const streamer = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  broadcasterId: "1007",
  login: "hanabi",
  displayName: "Hanabi",
  profileImageUrl: null,
  onlineSubscriptionId: "sub-on",
  offlineSubscriptionId: "sub-off",
  subscriptionStatus: "enabled",
  isLive: false,
  notifyEnabled: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  avatarUrl: null,
  bannerUrl: null,
  live: null,
  ...overrides,
});

type RowProps = Parameters<typeof ChannelRow>[0];

describe("追蹤的頻道的一列（Twitch）", () => {
  it("點列打開彈出視窗（不再展開 details）：按鈕上是名稱與離線狀態，詳情點了才出現", () => {
    const markup = renderToStaticMarkup(ChannelRow({ streamer: streamer() } as RowProps));

    expect(markup).not.toContain("<details");
    const button = markup.match(/<button[^>]*>/)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-haspopup="dialog"');
    expect(button).toContain('aria-expanded="false"');
    expect(textOf(markup)).toContain("Hanabi");
    expect(textOf(markup)).toContain("離線");
    expect(markup).toMatch(/<dialog[^>]*class="dialog /);
    expect(markup).not.toContain("twitch.tv/hanabi");
  });

  it("列的名稱就是按鈕上的內容（不另外蓋 aria-label）：通知關掉、訂閱有問題時報讀器也念得到", () => {
    const markup = renderToStaticMarkup(ChannelRow({ streamer: streamer({ notifyEnabled: false, onlineSubscriptionId: null, offlineSubscriptionId: null, subscriptionStatus: null }) } as RowProps));

    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(button.match(/^<button[^>]*>/)![0]).not.toContain("aria-label");
    expect(button).toContain('aria-label="通知已關閉"');
    expect(button).toContain('aria-label="未訂閱"');
  });

  it("視窗裡的通知開關旁邊寫著「開台通知」：手機上開關只剩圖示，看得出是什麼", () => {
    const markup = renderToStaticMarkup(ChannelDetail({ streamer: streamer() } as RowProps));

    const beforeSwitch = textOf(markup.slice(0, markup.lastIndexOf("<button", markup.indexOf('role="switch"'))));
    expect(beforeSwitch.endsWith("開台通知")).toBe(true);
  });

  it("視窗內容：直播狀態、訂閱狀態與說明、Twitch 連結、通知開關與刪除", () => {
    const markup = renderToStaticMarkup(
      ChannelDetail({
        streamer: streamer({ isLive: true, subscriptionStatus: "訂閱失敗：webhook_callback_verification_failed", live: { title: "今天玩鐵道", gameName: "Honkai: Star Rail", boxArtUrl: null, viewerCount: 1234, startedAt: null, previewUrl: null } }),
      } as RowProps),
    );
    const text = textOf(markup);

    expect(text).toContain("直播中");
    expect(text).toContain("Honkai: Star Rail");
    expect(text).toContain("今天玩鐵道");
    expect(text).toContain("訂閱失敗");
    expect(text).toContain("Twitch 驗證失敗");
    expect(markup).toMatch(/<a[^>]*href="https:\/\/twitch\.tv\/hanabi"/);
    expect(markup).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(text).toContain("刪除");
  });
});
