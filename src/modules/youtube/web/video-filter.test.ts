import { describe, expect, it } from "vitest";
import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";
import { VIDEO_FILTERS, countByFilter, latestVideos, thumbnailBadge, upNext, videoFilters } from "./video-filter";

const video = (zhCaptions: ZhCaptionStatus, translationStatus: TranslationStatus | null = null) => ({ zhCaptions, translationStatus });

describe("VIDEO_FILTERS：列表頁的篩選膠囊", () => {
  it("全部、有中文字幕、需要翻譯、翻譯完成", () => {
    expect(VIDEO_FILTERS.map((filter) => filter.label)).toEqual(["全部", "有中文字幕", "需要翻譯", "翻譯完成"]);
  });
});

describe("videoFilters：影片出現在哪些篩選裡", () => {
  it.each([
    ["有中文字幕", video("yes"), ["all", "zh"]],
    ["有中文字幕、也翻譯過", video("yes", "done"), ["all", "zh", "done"]],
    ["沒有中文字幕、還沒翻譯", video("no"), ["all", "translate"]],
    ["還沒確認有沒有中文字幕", video("unknown"), ["all", "translate"]],
    ["翻譯中", video("no", "running"), ["all", "translate"]],
    ["翻譯失敗", video("no", "failed"), ["all", "translate"]],
    ["翻譯完成", video("no", "done"), ["all", "done"]],
  ] as const)("%s → %j", (_name, input, expected) => {
    expect(videoFilters(input)).toEqual(expected);
  });

  it("countByFilter：每個篩選各有幾支", () => {
    expect(countByFilter([video("yes"), video("no"), video("no", "done"), video("unknown", "queued")])).toEqual({ all: 4, zh: 1, translate: 2, done: 1 });
  });
});

describe("thumbnailBadge：縮圖角落的小標籤", () => {
  it.each([
    ["有中文字幕（就算翻譯過也先說有中文字幕）", video("yes", "done"), { label: "中文字幕", tone: "default" }],
    ["翻譯完成", video("no", "done"), { label: "已翻譯", tone: "default" }],
    ["排隊中", video("no", "queued"), { label: "翻譯中", tone: "default" }],
    ["翻譯中", video("unknown", "running"), { label: "翻譯中", tone: "default" }],
    ["翻譯失敗", video("no", "failed"), { label: "翻譯失敗", tone: "danger" }],
    ["沒有中文字幕", video("no"), { label: "需要翻譯", tone: "default" }],
    ["還沒確認", video("unknown"), { label: "字幕未確認", tone: "default" }],
  ] as const)("%s", (_name, input, expected) => {
    expect(thumbnailBadge(input)).toEqual(expected);
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
