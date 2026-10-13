import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { CaptionCheckRefresh } from "../components/caption-check-refresh";
import { ChannelSidebar } from "../components/channel-sidebar";
import { VideoFeed, type FeedItem } from "../components/video-feed";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../service/cached", { spy: true });
vi.mock("../../service/caption-status", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedChannels", "cachedRecentVideos", "cachedRecheckCandidates", "cachedSavedVideos");
const { recheckDueCaptions } = mocksOf(await import("../../service/caption-status"), "recheckDueCaptions");
const { YoutubeHome } = await import("./youtube-page");

const CHECKED_AT = new Date(Date.now() - 2 * 3600_000);
type Overrides = { zhCaptions?: "yes" | "no" | "unknown"; zhCaptionsCheckedAt?: Date | null };
const video = (videoId: string, { zhCaptions = "no", zhCaptionsCheckedAt = CHECKED_AT }: Overrides = {}) => ({
  videoId,
  title: `影片 ${videoId}`,
  publishedAt: new Date(Date.now() - 3 * 3600_000),
  zhCaptions,
  zhCaptionsCheckedAt,
  channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
  channelTitle: "模擬頻道",
  channelThumbnail: null,
  translationStatus: null,
});

/** 只看伺服器元件回傳的元素樹，不實際算繪（client 元件要瀏覽器的 router） */
function findByType(node: ReactNode, type: unknown): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object" || !("type" in node)) return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.type === type ? element : findByType(element.props.children, type);
}

beforeEach(() => {
  requireSession.mockReset();
  vi.mocked(after).mockReset();
  recheckDueCaptions.mockReset().mockResolvedValue(0);
  cached.cachedChannels.mockReset().mockResolvedValue([]);
  cached.cachedRecentVideos.mockReset().mockResolvedValue([]);
  cached.cachedRecheckCandidates.mockReset().mockResolvedValue([]);
  cached.cachedSavedVideos.mockReset().mockResolvedValue([]);
});

describe("YouTube 頁：剛追蹤的頻道補進來的影片，背景檢查完字幕不用手動重新整理", () => {
  it("清單上有從沒檢查過字幕的影片_在背景檢查，並放上自動重新整理；都用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    const fresh = video("backfill001", { zhCaptions: "unknown", zhCaptionsCheckedAt: null });
    cached.cachedRecentVideos.mockResolvedValue([fresh, video("checked0001")]);
    cached.cachedRecheckCandidates.mockResolvedValue([{ videoId: fresh.videoId, publishedAt: fresh.publishedAt, zhCaptions: "unknown", zhCaptionsCheckedAt: null }]);

    const page = await YoutubeHome();

    expect(findByType(page, CaptionCheckRefresh)).toBeDefined();
    expect(after).toHaveBeenCalledOnce();
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<unknown>)();
    expect(recheckDueCaptions).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedRecentVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedRecheckCandidates).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("字幕都檢查過了（包括讀不到的「字幕未確認」）_不自動重新整理", async () => {
    cached.cachedRecentVideos.mockResolvedValue([video("checked0001"), video("unknown0001", { zhCaptions: "unknown" }), video("zhsubs00001", { zhCaptions: "yes" })]);

    expect(findByType(await YoutubeHome(), CaptionCheckRefresh)).toBeUndefined();
  });

  it("還沒有影片_不自動重新整理", async () => {
    expect(findByType(await YoutubeHome(), CaptionCheckRefresh)).toBeUndefined();
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
  const savedVideo = (videoId: string) => ({ videoId, title: "影片", channelTitle: "頻道", pinned: true, savedAt: new Date(), translationStatus: null });

  it("訂閱內容上面有「已保留（N）」，數的是自己保留的影片；手機也看得到（不是只在寬螢幕的側欄）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("saved000001"), savedVideo("saved000002")]);

    const sidebar = findByType(await YoutubeHome(), ChannelSidebar) as ReactElement;
    const markup = renderToStaticMarkup(sidebar);

    expect(markup).toMatch(/<a[^>]*href="\/youtube\/saved"/);
    expect(markup.replace(/<[^>]+>/g, "")).toContain("已保留（2）");
    expect(markup).not.toMatch(/<a[^>]*href="\/youtube\/saved"[^>]*class="[^"]*\bhidden\b/);
    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒有保留的影片_入口照樣在（數量是 0），找得到這個功能", async () => {
    const markup = renderToStaticMarkup(findByType(await YoutubeHome(), ChannelSidebar) as ReactElement);

    expect(markup.replace(/<[^>]+>/g, "")).toContain("已保留（0）");
  });
});
