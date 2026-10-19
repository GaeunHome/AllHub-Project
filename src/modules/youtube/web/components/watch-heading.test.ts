import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import { VIDEO_ID as VIDEO, savedVideo } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedFollowedVideo", "cachedChannelAvatar", "cachedVideoInfo", "cachedSavedVideos");
const { WatchChannel } = await import("./watch-heading");
const { AutoSavedContext } = await import("./save-video-button");

const html = async () => textOf(renderToStaticMarkup((await WatchChannel({ videoId: VIDEO })) as ReactElement), { spaced: true });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedFollowedVideo.mockReset().mockResolvedValue(null);
  cached.cachedChannelAvatar.mockReset().mockResolvedValue(null);
  cached.cachedVideoInfo.mockReset().mockResolvedValue({ title: "새 영상", channelName: "뉴진스", channelUrl: "https://www.youtube.com/@NewJeans_official" });
  cached.cachedSavedVideos.mockReset().mockResolvedValue([]);
});

describe("觀看頁的頻道列：頻道名稱旁邊是「保留」", () => {
  it("用登入者的 id 讀自己保留的影片；這支還沒保留_顯示「保留」", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("otherVideo1")]);

    const text = await html();

    expect(text).toContain("뉴진스");
    expect(text).toContain(" 保留 ");
    expect(text).not.toContain("已保留");
    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it.each([
    ["手動保留的", true],
    ["翻譯時自動加入的", false],
  ])("這支已經在清單裡（%s）_顯示「已保留」", async (_name, pinned) => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo(VIDEO, { pinned })]);

    expect(await html()).toContain("已保留");
  });

  it("這一頁按「用我的 API Key 繼續翻譯」後剛自動加入（續翻不重繪頁面，伺服器讀到的還沒有）_當場顯示「已保留」", async () => {
    const channel = (await WatchChannel({ videoId: VIDEO })) as ReactElement;

    const markup = renderToStaticMarkup(createElement(AutoSavedContext, { value: { videoId: VIDEO, clear: vi.fn() } }, channel));

    expect(textOf(markup, { spaced: true })).toContain("已保留");
  });

  it("讀不到頻道資訊_照樣可以保留", async () => {
    cached.cachedVideoInfo.mockResolvedValue(null);

    expect(await html()).toContain(" 保留 ");
  });
});
