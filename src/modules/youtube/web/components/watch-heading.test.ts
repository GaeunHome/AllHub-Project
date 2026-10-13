import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedVideoChannel", "cachedChannelAvatar", "cachedVideoInfo", "cachedSavedVideos");
const { WatchChannel } = await import("./watch-heading");
const { AutoSavedContext } = await import("./save-video-button");

const VIDEO = "dQw4w9WgXcQ";
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const html = async () => renderToStaticMarkup((await WatchChannel({ videoId: VIDEO })) as ReactElement);
const savedVideo = (videoId: string, pinned: boolean) => ({ videoId, title: "影片", channelTitle: "頻道", pinned, savedAt: new Date(), translationStatus: null });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedVideoChannel.mockReset().mockResolvedValue(null);
  cached.cachedChannelAvatar.mockReset().mockResolvedValue(null);
  cached.cachedVideoInfo.mockReset().mockResolvedValue({ title: "새 영상", channelName: "뉴진스", channelUrl: "https://www.youtube.com/@NewJeans_official" });
  cached.cachedSavedVideos.mockReset().mockResolvedValue([]);
});

describe("觀看頁的頻道列：頻道名稱旁邊是「保留」", () => {
  it("用登入者的 id 讀自己保留的影片；這支還沒保留_顯示「保留」", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("otherVideo1", true)]);

    const text = textOf(await html());

    expect(text).toContain("뉴진스");
    expect(text).toContain(" 保留 ");
    expect(text).not.toContain("已保留");
    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it.each([
    ["手動保留的", true],
    ["翻譯時自動加入的", false],
  ])("這支已經在清單裡（%s）_顯示「已保留」", async (_name, pinned) => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo(VIDEO, pinned)]);

    expect(textOf(await html())).toContain("已保留");
  });

  it("這一頁按「用我的 API Key 繼續翻譯」後剛自動加入（續翻不重繪頁面，伺服器讀到的還沒有）_當場顯示「已保留」", async () => {
    const channel = (await WatchChannel({ videoId: VIDEO })) as ReactElement;

    const markup = renderToStaticMarkup(createElement(AutoSavedContext, { value: { videoId: VIDEO, clear: vi.fn() } }, channel));

    expect(textOf(markup)).toContain("已保留");
  });

  it("讀不到頻道資訊_照樣可以保留", async () => {
    cached.cachedVideoInfo.mockResolvedValue(null);

    expect(textOf(await html())).toContain(" 保留 ");
  });
});
