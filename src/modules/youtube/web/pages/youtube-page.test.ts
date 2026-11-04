import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import { ChannelSidebar } from "../components/channel-sidebar";
import { VideoFeed, type FeedItem } from "../components/video-feed";
import { feedVideo, findByType, savedVideo } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedChannels", "cachedRecentVideos", "cachedSavedVideos");
const { YoutubeHome } = await import("./youtube-page");

const video = feedVideo;

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedChannels.mockReset().mockResolvedValue([]);
  cached.cachedRecentVideos.mockReset().mockResolvedValue([]);
  cached.cachedSavedVideos.mockReset().mockResolvedValue([]);
});

describe("YouTube 頁", () => {
  it("用登入者（bob）的 id 讀資料", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await YoutubeHome();

    expect(cached.cachedRecentVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedChannels).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("YouTube 頁：第一排的縮圖常常是 LCP", () => {
  it("前 4 支（寬螢幕的一排）的縮圖不延遲載入，後面的照樣延遲", async () => {
    cached.cachedRecentVideos.mockResolvedValue(["vid00000001", "vid00000002", "vid00000003", "vid00000004", "vid00000005", "vid00000006"].map((id) => video(id)));

    const feed = findByType(await YoutubeHome(), VideoFeed) as ReactElement<{ items: FeedItem[] }>;
    const loading = feed.props.items.map((item) => renderToStaticMarkup(item.card).match(/<img[^>]*i\.ytimg\.com[^>]*>/)?.[0].match(/loading="(\w+)"/)?.[1]);

    expect(loading).toEqual(["eager", "eager", "eager", "eager", "lazy", "lazy"]);
  });
});

describe("YouTube 頁：已保留的影片的入口", () => {
  it("訂閱內容上面有「已保留（N）」，數的是自己保留的影片；手機也看得到（不是只在寬螢幕的側欄）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("saved000001"), savedVideo("saved000002")]);

    const sidebar = findByType(await YoutubeHome(), ChannelSidebar) as ReactElement;
    const markup = renderToStaticMarkup(sidebar);

    expect(markup).toMatch(/<a[^>]*href="\/youtube\/saved"/);
    expect(textOf(markup)).toContain("已保留（2）");
    expect(markup).not.toMatch(/<a[^>]*href="\/youtube\/saved"[^>]*class="[^"]*\bhidden\b/);
    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒有保留的影片_入口照樣在（數量是 0），找得到這個功能", async () => {
    const markup = renderToStaticMarkup(findByType(await YoutubeHome(), ChannelSidebar) as ReactElement);

    expect(textOf(markup)).toContain("已保留（0）");
  });
});
