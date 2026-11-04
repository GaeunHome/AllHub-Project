import { describe, expect, it } from "vitest";
import type { TranslationStatus } from "../data/schema";
import { VIDEO_FILTERS, latestVideos, savedBadge, thumbnailBadge, upNext, videoFilters } from "./video-filter";

const video = (translationStatus: TranslationStatus | null = null) => ({ translationStatus });

describe("VIDEO_FILTERS：列表頁的篩選膠囊", () => {
  it("全部、翻譯完成", () => {
    expect(VIDEO_FILTERS.map((filter) => filter.label)).toEqual(["全部", "翻譯完成"]);
  });
});

describe("videoFilters：影片出現在哪些篩選裡", () => {
  it.each([
    ["還沒翻譯", video(), ["all"]],
    ["翻譯中", video("running"), ["all"]],
    ["翻譯失敗", video("failed"), ["all"]],
    ["翻譯完成", video("done"), ["all", "done"]],
  ] as const)("%s → %j", (_name, input, expected) => {
    expect(videoFilters(input)).toEqual(expected);
  });
});

describe("thumbnailBadge：縮圖角落的小標籤只看翻譯進度", () => {
  it.each([
    ["翻譯完成", video("done"), { label: "已翻譯", tone: "default" }],
    ["排隊中", video("queued"), { label: "翻譯中", tone: "default" }],
    ["翻譯中", video("running"), { label: "翻譯中", tone: "default" }],
    ["翻譯失敗", video("failed"), { label: "翻譯失敗", tone: "danger" }],
    ["還沒翻譯：不標", video(), null],
  ] as const)("%s", (_name, input, expected) => {
    expect(thumbnailBadge(input)).toEqual(expected);
  });
});

describe("savedBadge：已保留的影片縮圖角落的小標籤（跟 thumbnailBadge 同一套字，沒翻譯時才不同）", () => {
  it.each([
    ["翻譯完成", "done", { label: "已翻譯", tone: "default" }],
    ["排隊中", "queued", { label: "翻譯中", tone: "default" }],
    ["翻譯中", "running", { label: "翻譯中", tone: "default" }],
    ["翻譯失敗", "failed", { label: "翻譯失敗", tone: "danger" }],
    ["還沒有翻譯（手動保留的）", null, { label: "還沒翻譯", tone: "default" }],
  ] as const)("%s", (_name, status, expected) => {
    expect(savedBadge(status)).toEqual(expected);
  });
});

describe("upNext：觀看頁右側的「接下來播放」", () => {
  const list = ["a", "b", "c", "d"].map((videoId) => ({ videoId }));

  it("拿掉正在看的這支，其餘照原本的順序", () => {
    expect(upNext(list, "b").map((v) => v.videoId)).toEqual(["a", "c", "d"]);
  });

  it("最多 limit 支", () => {
    expect(upNext(list, "zzz", 2).map((v) => v.videoId)).toEqual(["a", "b"]);
  });
});

describe("latestVideos：首頁「最新影片」", () => {
  const list = ["a", "b", "c", "d", "e", "f", "g", "h"].map((videoId) => ({ videoId }));

  it("清單已經是新的在前_預設取前 4 支（寬螢幕剛好一排），其餘算進 more", () => {
    const picked = latestVideos(list);

    expect(picked.shown.map((v) => v.videoId)).toEqual(["a", "b", "c", "d"]);
    expect(picked.more).toBe(4);
  });

  it("可以指定支數_不到上限就全部列出", () => {
    expect(latestVideos(list, 6).shown).toHaveLength(6);
    expect(latestVideos(list.slice(0, 3), 6)).toEqual({ shown: list.slice(0, 3), more: 0 });
  });

  it("沒有影片_空清單", () => {
    expect(latestVideos([])).toEqual({ shown: [], more: 0 });
  });
});
