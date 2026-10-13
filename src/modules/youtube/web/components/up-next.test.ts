import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedRecentVideos");
const { UpNext } = await import("./up-next");

const video = (videoId: string) => ({
  videoId,
  title: `影片 ${videoId}`,
  publishedAt: new Date(Date.now() - 3 * 3600_000),
  zhCaptions: "no",
  zhCaptionsCheckedAt: new Date(),
  channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
  channelTitle: "模擬頻道",
  channelThumbnail: null,
  translationStatus: null,
});
const html = async (current = "watching001") => renderToStaticMarkup((await UpNext({ params: Promise.resolve({ videoId: current }) })) as ReactElement);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedRecentVideos.mockReset().mockResolvedValue([]);
});

describe("觀看頁的「接下來播放」", () => {
  it("用登入者的 id 讀影片清單，去掉正在看的這支", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedRecentVideos.mockResolvedValue([video("watching001"), video("next0000001")]);

    const markup = await html();

    expect(cached.cachedRecentVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(markup).toContain("影片 next0000001");
    expect(markup).not.toContain("影片 watching001");
  });

  it("寬螢幕上第一支在畫面最上面（播放器是跨網域的 iframe，不算 LCP，常常輪到這張縮圖）：不延遲載入，其他照樣延遲", async () => {
    cached.cachedRecentVideos.mockResolvedValue(["next0000001", "next0000002", "next0000003"].map(video));

    const loading = [...(await html()).matchAll(/<img[^>]*i\.ytimg\.com[^>]*>/g)].map((m) => m[0].match(/loading="(\w+)"/)?.[1]);

    expect(loading).toEqual(["eager", "lazy", "lazy"]);
  });
});
