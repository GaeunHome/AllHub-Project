import { describe, expect, it } from "vitest";
import { isYoutubeHttpsUrl, youtubeChannelPageUrl, youtubeChannelRef, youtubeThumbnailUrl } from "./urls";

describe("youtubeThumbnailUrl：影片縮圖用影片 id 組出來，不必呼叫 API", () => {
  it("用每支影片都有的 16:9 縮圖（mqdefault）", () => {
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  it("id 含 - 與 _ 也原樣放進路徑", () => {
    expect(youtubeThumbnailUrl("a-b_c-d_e-f")).toBe("https://i.ytimg.com/vi/a-b_c-d_e-f/mqdefault.jpg");
  });
});

describe("youtubeChannelPageUrl：讀頭像用的頻道頁", () => {
  it("UC 開頭的頻道 id_/channel/ 網址", () => {
    expect(youtubeChannelPageUrl("UC" + "a".repeat(22))).toBe(`https://www.youtube.com/channel/UC${"a".repeat(22)}`);
  });

  it("@handle_/@ 網址_非 ASCII 的 handle 編碼後放進路徑", () => {
    expect(youtubeChannelPageUrl("@NewJeans_official")).toBe("https://www.youtube.com/@NewJeans_official");
    expect(youtubeChannelPageUrl("@뉴진스")).toBe(`https://www.youtube.com/@${encodeURIComponent("뉴진스")}`);
  });

  it("其他字串_null_不組出奇怪的網址", () => {
    expect(youtubeChannelPageUrl("")).toBeNull();
    expect(youtubeChannelPageUrl("UCshort")).toBeNull();
    expect(youtubeChannelPageUrl("@")).toBeNull();
    expect(youtubeChannelPageUrl("https://evil.example.com/")).toBeNull();
    expect(youtubeChannelPageUrl("@a/../../x")).toBeNull();
  });
});

describe("youtubeChannelRef：頻道 id 或 @handle（讀頭像、當快取 key）", () => {
  it("頻道網址、/@ 網址、@handle 都整理成固定格式", () => {
    expect(youtubeChannelRef(`https://www.youtube.com/channel/UC${"b".repeat(22)}`)).toBe(`UC${"b".repeat(22)}`);
    expect(youtubeChannelRef("https://www.youtube.com/@NewJeans_official")).toBe("@NewJeans_official");
    expect(youtubeChannelRef("@NewJeans_official")).toBe("@NewJeans_official");
  });

  it("舊式的 /c/、/user/ 網址或其他網站_null", () => {
    expect(youtubeChannelRef("https://www.youtube.com/c/NewJeans")).toBeNull();
    expect(youtubeChannelRef("https://www.youtube.com/user/NewJeans")).toBeNull();
    expect(youtubeChannelRef("https://evil.example.com/@x")).toBeNull();
  });
});

describe("isYoutubeHttpsUrl：只收 YouTube（含子網域）的 https 網址（字幕的下載網址、oEmbed 的頻道網址共用）", () => {
  it.each(["https://youtube.com/@x", "https://www.youtube.com/api/timedtext?lang=ko", "https://m.youtube.com/watch?v=x", "https://WWW.YouTube.com/@x"])("%s_收", (url) => {
    expect(isYoutubeHttpsUrl(new URL(url))).toBe(true);
  });

  it.each([
    ["不是 https", "http://www.youtube.com/@x"],
    ["網域只是開頭相同", "https://www.youtube.com.evil.example/@x"],
    ["相似網域", "https://notyoutube.com/@x"],
    ["別的網域、網址裡帶著 youtube.com", "https://evil.example.com/?next=https://www.youtube.com/"],
    ["不是網頁網址", "javascript:alert(1)"],
  ])("%s_不收", (_name, url) => {
    expect(isYoutubeHttpsUrl(new URL(url))).toBe(false);
  });
});
