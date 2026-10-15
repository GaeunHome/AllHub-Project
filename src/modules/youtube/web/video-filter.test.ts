import { describe, expect, it } from "vitest";
import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";
import { VIDEO_FILTERS, captionCheckPending, latestVideos, savedBadge, thumbnailBadge, upNext, videoFilters } from "./video-filter";

const CHECKED_AT = new Date("2026-10-07T12:00:00Z");
/** 沒特別說的都檢查過字幕 從沒檢查過的傳 null */
const video = (zhCaptions: ZhCaptionStatus, translationStatus: TranslationStatus | null = null, zhCaptionsCheckedAt: Date | null = CHECKED_AT) => ({ zhCaptions, translationStatus, zhCaptionsCheckedAt });

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
});

describe("thumbnailBadge：縮圖角落的小標籤", () => {
  it.each([
    ["有中文字幕（就算翻譯過也先說有中文字幕）", video("yes", "done"), { label: "中文字幕", tone: "default" }],
    ["翻譯完成", video("no", "done"), { label: "已翻譯", tone: "default" }],
    ["排隊中", video("no", "queued"), { label: "翻譯中", tone: "default" }],
    ["翻譯中", video("unknown", "running"), { label: "翻譯中", tone: "default" }],
    ["翻譯失敗", video("no", "failed"), { label: "翻譯失敗", tone: "danger" }],
    ["沒有中文字幕", video("no"), { label: "需要翻譯", tone: "default" }],
    ["檢查過但讀不到（被 YouTube 擋下）", video("unknown"), { label: "字幕未確認", tone: "default" }],
    ["從沒檢查過（剛追蹤的頻道，背景正在檢查）", video("unknown", null, null), { label: "檢查字幕中", tone: "default" }],
    ["從沒檢查過、但已經在翻譯", video("unknown", "running", null), { label: "翻譯中", tone: "default" }],
  ] as const)("%s", (_name, input, expected) => {
    expect(thumbnailBadge(input)).toEqual(expected);
  });
});

describe("savedBadge：已保留的影片縮圖角落的小標籤（沒有檢查中文字幕，只看翻譯進度，跟 thumbnailBadge 同一套字）", () => {
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

describe("captionCheckPending：從沒檢查過字幕（背景正在檢查，過幾秒重新整理就看得到結果）", () => {
  it.each([
    ["從沒檢查過", video("unknown", null, null), true],
    ["檢查過但讀不到", video("unknown"), false],
    ["檢查過、沒有中文", video("no"), false],
    ["有中文字幕（舊資料沒有檢查時間也算確定了）", video("yes", null, null), false],
  ] as const)("%s → %s", (_name, input, expected) => {
    expect(captionCheckPending(input)).toBe(expected);
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
