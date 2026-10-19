import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import { findByType, savedVideo } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedSavedVideos", "cachedVideoInfo");
const actions = await import("../actions");
const { ActionButton } = await import("@/core/ui/action-button");
const { EmptyState } = await import("@/core/ui/empty-state");
const { SavedVideoCard } = await import("../components/saved-video-card");
const { SavedVideoList } = await import("../components/saved-video-list");
const { SavedVideosLoader } = await import("./saved-page");

type CardProps = Parameters<typeof SavedVideoCard>[0];
type Item = { id: string; text: string; card: ReactElement<CardProps> };
type ListProps = { items: Item[]; limit: number };

/** 標籤換成空白 比對前後有分隔的詞 */
const spacedText = (markup: string) => textOf(markup, { spaced: true });
const loaded = async () => (await SavedVideosLoader()) as ReactElement<ListProps>;
const cardHtml = (item: Item) => renderToStaticMarkup(item.card);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedSavedVideos.mockReset().mockResolvedValue([]);
  cached.cachedVideoInfo.mockReset().mockResolvedValue(null);
});

describe("已保留的影片（/youtube/saved）", () => {
  it("用登入者的 id 讀自己的清單", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await SavedVideosLoader();

    expect(cached.cachedSavedVideos).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒有保留的影片_空狀態說明怎麼保留（觀看頁的「保留」、按過翻譯會自動加入），連回 YouTube 頁", async () => {
    const page = await loaded();

    expect(page.type).toBe(EmptyState);
    const markup = renderToStaticMarkup(page);
    expect(spacedText(markup)).toContain("還沒有保留的影片");
    expect(spacedText(markup)).toContain("「保留」");
    expect(spacedText(markup)).toContain("翻譯");
    expect(markup).toContain('href="/youtube"');
  });

  it("清單在瀏覽器裡篩選：上限 15 部，照 service 的順序（新的在前），篩選的文字是標題加頻道名稱", async () => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("newest00001"), savedVideo("older000001", { channelTitle: null, title: "標題而已" })]);

    const page = await loaded();

    expect(page.type).toBe(SavedVideoList);
    expect(page.props.limit).toBe(15);
    expect(page.props.items.map((item) => item.id)).toEqual(["newest00001", "older000001"]);
    expect(page.props.items[0].text).toBe("影片 newest00001 模擬頻道");
    expect(page.props.items[1].text).toBe("標題而已");
  });

  it("每一部：縮圖與翻譯狀態、標題、頻道、手動保留／翻譯過、保留時間；縮圖與標題都連到觀看頁", async () => {
    cached.cachedSavedVideos.mockResolvedValue([
      savedVideo("pinned00001", { translationStatus: "done" }),
      savedVideo("auto0000001", { pinned: false, translationStatus: "failed" }),
      savedVideo("notyet00001"),
    ]);

    const [pinned, auto, notYet] = (await loaded()).props.items.map(cardHtml);

    expect(pinned).toMatch(/<img[^>]*i\.ytimg\.com\/vi\/pinned00001\/mqdefault\.jpg/);
    expect(spacedText(pinned)).toContain("已翻譯");
    expect(spacedText(pinned)).toContain("影片 pinned00001");
    expect(spacedText(pinned)).toContain("模擬頻道");
    expect(spacedText(pinned)).toContain("手動保留");
    expect(spacedText(pinned)).toContain("3 小時前");
    expect(pinned.match(/href="\/youtube\/watch\/pinned00001"/g)).toHaveLength(2);
    expect(spacedText(auto)).toContain("翻譯過");
    expect(auto).toMatch(/yt-badge-danger[^>]*>[^<]*翻譯失敗/);
    expect(spacedText(notYet)).toContain("還沒翻譯");
  });

  it("選單裡的移除：送出的是這支影片，先跳確認（翻譯好的字幕不會刪）", async () => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("pinned00001")]);
    const [item] = (await loaded()).props.items;

    const remove = findByType(SavedVideoCard(item.card.props), ActionButton) as ReactElement<{ action: unknown; fields: object; confirmMessage: string }>;

    expect(remove.props.action).toBe(actions.removeSavedVideoAction);
    expect(remove.props.fields).toEqual({ videoId: "pinned00001" });
    expect(remove.props.confirmMessage).toContain("影片 pinned00001");
    expect(remove.props.confirmMessage).toContain("翻譯");
  });

  it("保留時沒讀到標題或頻道名稱_再試一次 oEmbed 的快取；還是讀不到就顯示影片 id", async () => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("noTitle0001", { title: null, channelTitle: null }), savedVideo("stillNone01", { title: null, channelTitle: null })]);
    cached.cachedVideoInfo.mockImplementation(async (videoId: string) => (videoId === "noTitle0001" ? { title: "oEmbed 標題", channelName: "oEmbed 頻道", channelUrl: null } : null));

    const [found, missing] = (await loaded()).props.items;

    expect(found.text).toBe("oEmbed 標題 oEmbed 頻道");
    expect(spacedText(cardHtml(found))).toContain("oEmbed 頻道");
    expect(missing.text).toBe("stillNone01");
    expect(spacedText(cardHtml(missing))).toContain("stillNone01");
    expect(cached.cachedVideoInfo).toHaveBeenCalledTimes(2);
  });

  it("標題與頻道名稱都有_不向外查", async () => {
    cached.cachedSavedVideos.mockResolvedValue([savedVideo("complete001")]);

    await loaded();

    expect(cached.cachedVideoInfo).not.toHaveBeenCalled();
  });

  it("第一排（這頁沒有側欄，寬螢幕一排 5 部）的縮圖常常是 LCP，不延遲載入；後面的照樣延遲", async () => {
    cached.cachedSavedVideos.mockResolvedValue(Array.from({ length: 7 }, (_, i) => savedVideo(`video00000${i}`)));

    const loading = (await loaded()).props.items.map((item) => cardHtml(item).match(/<img[^>]*i\.ytimg\.com[^>]*>/)?.[0].match(/loading="(\w+)"/)?.[1]);

    expect(loading).toEqual(["eager", "eager", "eager", "eager", "eager", "lazy", "lazy"]);
  });
});
