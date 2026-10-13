import { describe, expect, it } from "vitest";
import { parseOembed } from "./oembed";

describe("parseOembed：任意影片的標題與頻道（官方、免金鑰）", () => {
  it("讀出標題、頻道名稱與頻道網址", () => {
    expect(parseOembed({ title: "새 영상", author_name: "NewJeans", author_url: "https://www.youtube.com/@NewJeans_official", type: "video" })).toEqual({
      title: "새 영상",
      channelName: "NewJeans",
      channelUrl: "https://www.youtube.com/@NewJeans_official",
    });
  });

  it("缺欄位或型別不對_給 null", () => {
    expect(parseOembed({ title: 3, author_name: "" })).toEqual({ title: null, channelName: null, channelUrl: null });
    expect(parseOembed(null)).toEqual({ title: null, channelName: null, channelUrl: null });
  });

  it("頻道網址不是 YouTube 的_不採用", () => {
    expect(parseOembed({ title: "a", author_url: "https://evil.example.com/@x" }).channelUrl).toBeNull();
    expect(parseOembed({ title: "a", author_url: "javascript:alert(1)" }).channelUrl).toBeNull();
  });

  it("不是 https、或網域只是開頭相同的頻道網址_也不採用；子網域可以", () => {
    expect(parseOembed({ title: "a", author_url: "http://www.youtube.com/@x" }).channelUrl).toBeNull();
    expect(parseOembed({ title: "a", author_url: "https://www.youtube.com.evil.example/@x" }).channelUrl).toBeNull();
    expect(parseOembed({ title: "a", author_url: "https://m.youtube.com/@x" }).channelUrl).toBe("https://m.youtube.com/@x");
  });
});
