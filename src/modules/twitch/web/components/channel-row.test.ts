import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { textOf } from "@/dev/test-helpers";
import { followedStreamer } from "../../dev/fixtures";

vi.mock("../actions", () => ({ removeStreamerAction: vi.fn(), setStreamerNotifyAction: vi.fn() }));

const { ChannelRow, ChannelDetail } = await import("./channel-row");

const streamer = (overrides: Record<string, unknown> = {}) => ({ ...followedStreamer(7, "hanabi", { displayName: "Hanabi" }), avatarUrl: null, bannerUrl: null, live: null, ...overrides });

type RowProps = Parameters<typeof ChannelRow>[0];

const NOW = new Date("2026-10-13T12:00:00Z");
const PREVIEW = "https://static-cdn.jtvnw.net/previews-ttv/live_user_hanabi-640x360.jpg";
const LARGE_PREVIEW = "https://static-cdn.jtvnw.net/previews-ttv/live_user_hanabi-1920x1080.jpg";
const BANNER = "https://static-cdn.jtvnw.net/jtv_user_pictures/hanabi-channel_offline_image-1920x1080.png";
const live = (overrides: Record<string, unknown> = {}) => ({
  title: "今天玩鐵道",
  gameName: "Honkai: Star Rail",
  boxArtUrl: null,
  viewerCount: 1234,
  startedAt: "2026-10-13T10:25:00Z",
  previewUrl: PREVIEW,
  largePreviewUrl: LARGE_PREVIEW,
  ...overrides,
});
const detail = (overrides: Record<string, unknown>) => renderToStaticMarkup(ChannelDetail({ streamer: streamer(overrides), now: NOW } as RowProps));
/** 預覽圖外框的 class 裡面是預覽圖或佔位 */
const stageOf = (markup: string) => markup.match(/<div class="([^"]*\baspect-video\b[^"]*)"/)?.[1].split(/\s+/) ?? [];
/** 預覽圖外框裡的 markup 裡面只有 img 與 span 第一個 </div> 就是結尾 */
const stageHtml = (markup: string) => markup.slice(markup.indexOf("aspect-video"), markup.indexOf("</div>", markup.indexOf("aspect-video")));

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

  it("直播中的列：紅點旁只寫人數（千分位，不寫「人觀看」）；Helix 還查不到人數時寫「直播中」", () => {
    const row = (viewerCount: number | null) => textOf(renderToStaticMarkup(ChannelRow({ streamer: streamer({ isLive: true, live: live({ viewerCount }) }), now: NOW } as RowProps)));

    expect(row(1234)).toContain("1,234");
    expect(row(1234)).not.toContain("人觀看");
    expect(row(0)).toContain("Honkai: Star Rail0");
    expect(row(null)).toMatch(/Honkai: Star Rail直播中/);
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

describe("主播詳情：滿版的大面板（Twitch）", () => {
  it("視窗是滿版的大面板（Dialog 的 size=full），跟星穹鐵道的角色詳情一樣", () => {
    const markup = renderToStaticMarkup(ChannelRow({ streamer: streamer(), now: NOW } as RowProps));

    expect(markup).toMatch(/<dialog[^>]*class="dialog dialog-full"/);
  });

  it("直播中：放大的直播預覽（16:9、完整顯示，用大張的預覽圖：直播卡片的 640x360 放大到 1400px 以上會糊），左上 LIVE、左下觀看人數、右上開台多久", () => {
    const stage = stageHtml(detail({ isLive: true, live: live() }));
    const img = stage.match(/<img[^>]*>/)?.[0] ?? "";

    expect(img).toContain(`src="${LARGE_PREVIEW}"`);
    expect(img).toMatch(/class="[^"]*object-contain/);
    expect(textOf(stage)).toContain("LIVE");
    expect(textOf(stage)).toContain("1,234 人觀看");
    expect(textOf(stage)).toContain("開台 1 小時 35 分");
  });

  it("寬螢幕：左邊是預覽與直播資訊，右邊一欄是通知開關、訂閱狀態、Twitch 連結與刪除", () => {
    const markup = detail({ isLive: true, live: live() });
    const grid = markup.match(/^<div class="([^"]*)"/)![1].split(/\s+/);
    const side = markup.slice(markup.indexOf("<aside"));

    expect(grid).toEqual(expect.arrayContaining(["lg:grid-cols-[minmax(0,1fr)_22rem]"]));
    expect(side).toContain('role="switch"');
    expect(side).toContain("twitch.tv/hanabi");
    expect(textOf(side)).toContain("刪除");
    expect(markup.indexOf("aspect-video")).toBeLessThan(markup.indexOf("<aside"));
  });

  it("離線、有離線橫幅：預覽的位置放大顯示橫幅，左上標示離線；下面不再重複（沒有標題與遊戲）", () => {
    const markup = detail({ bannerUrl: BANNER });
    const stage = stageHtml(markup);

    expect(stage).toMatch(new RegExp(`<img[^>]*src="${BANNER}"`));
    expect(textOf(stage)).toContain("離線");
    expect(textOf(stage)).not.toContain("LIVE");
    expect(textOf(markup).match(/離線/g)).toHaveLength(1);
  });

  it("離線、沒有橫幅（或直播中但還查不到預覽）：放頭像的佔位，版面一樣大", () => {
    for (const [markup, state] of [
      [detail({}), "離線"],
      [detail({ isLive: true, live: live({ previewUrl: null, largePreviewUrl: null }) }), "直播中"],
    ]) {
      const stage = stageHtml(markup);

      expect(stageOf(markup)).toContain("w-full");
      expect(stage).not.toContain("<img");
      // 沒有頭像網址時是名字的第一個字
      expect(stage).toMatch(/rounded-full[^>]*>H<\/span>/);
      expect(textOf(stage)).toContain(state);
    }
  });
});
