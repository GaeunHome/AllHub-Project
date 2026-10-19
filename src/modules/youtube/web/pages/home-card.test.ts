import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import { feedVideo } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedRecentVideos", "cachedChannelAvatar");
const { LatestVideos } = await import("./home-card");

const html = async () => renderToStaticMarkup((await LatestVideos()) as ReactElement);

/** 追蹤時存下的頭像 頻道頁的頭像還在讀的時候先用它 */
const video = (videoId: string, overrides: Parameters<typeof feedVideo>[1] = {}) => feedVideo(videoId, { channelThumbnail: "https://yt3.ggpht.com/ytc/stored-avatar", ...overrides });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedRecentVideos.mockReset().mockResolvedValue([]);
  cached.cachedChannelAvatar.mockReset().mockResolvedValue(null);
});

describe("首頁「最新影片」（YouTube）", () => {
  it("用登入者的 id 讀影片清單：只有自己追蹤頻道的影片", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedRecentVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒有影片_空狀態連到 YouTube 頁追蹤頻道", async () => {
    const markup = await html();

    expect(textOf(markup)).toContain("還沒有影片");
    expect(markup).toContain('href="/youtube"');
  });

  it("只列最新的 4 支：縮圖、標題、頻道頭像與名稱、多久以前", async () => {
    cached.cachedRecentVideos.mockResolvedValue(["vid00000001", "vid00000002", "vid00000003", "vid00000004", "vid00000005"].map((id) => video(id)));

    const markup = await html();
    const text = textOf(markup);

    // 只數 <img> 不延遲載入的縮圖 React 另外會放 <link rel="preload"> 先載
    expect(markup.match(/<img[^>]*i\.ytimg\.com\/vi\/[\w-]+\/mqdefault\.jpg/g)).toHaveLength(4);
    expect(text).toContain("影片 vid00000004");
    expect(text).not.toContain("影片 vid00000005");
    expect(text).toContain("模擬頻道");
    expect(text).toContain("3 小時前");
    // 頻道頁的頭像還在讀的時候 先用追蹤時存下的
    expect(markup).toContain("yt3.ggpht.com/ytc/stored-avatar");
    expect(markup).toContain('href="/youtube"');
  });

  it("縮圖常常是首頁的 LCP：最新影片那一排（最多 4 支）都不延遲載入；頻道頭像照樣延遲", async () => {
    cached.cachedRecentVideos.mockResolvedValue(["vid00000001", "vid00000002", "vid00000003", "vid00000004", "vid00000005"].map((id) => video(id)));

    const markup = await html();
    const thumbnails = markup.match(/<img[^>]*i\.ytimg\.com[^>]*>/g) ?? [];
    const avatars = markup.match(/<img[^>]*yt3\.ggpht\.com[^>]*>/g) ?? [];

    expect(thumbnails).toHaveLength(4);
    for (const img of thumbnails) expect(img).toContain('loading="eager"');
    expect(avatars.length).toBeGreaterThan(0);
    for (const img of avatars) expect(img).toContain('loading="lazy"');
  });

  it("狀態標籤與點擊照 YouTube 頁的規則：有中文字幕直接到 YouTube（新分頁），其他到翻譯觀看頁", async () => {
    cached.cachedRecentVideos.mockResolvedValue([
      video("zhsubs00001", { zhCaptions: "yes" }),
      video("needtrans01", { zhCaptions: "no" }),
      video("translated1", { zhCaptions: "no", translationStatus: "done" }),
    ]);

    const markup = await html();
    const text = textOf(markup);

    expect(text).toContain("中文字幕");
    expect(text).toContain("需要翻譯");
    expect(text).toContain("已翻譯");
    expect(markup).toMatch(/<a[^>]*href="https:\/\/www\.youtube\.com\/watch\?v=zhsubs00001"[^>]*target="_blank"/);
    expect(markup).toContain('href="/youtube/watch/needtrans01"');
    expect(markup).toContain('href="/youtube/watch/translated1"');
    expect(markup).not.toContain('href="/youtube/watch/zhsubs00001"');
  });
});
