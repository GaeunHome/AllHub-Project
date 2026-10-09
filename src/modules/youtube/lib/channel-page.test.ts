import { describe, expect, it } from "vitest";
import { parseChannelAvatar, parseChannelId } from "./channel-page";

const CH = "UC" + "x".repeat(22);
const AVATAR = "https://yt3.googleusercontent.com/ytc/AIdro_abc123=s900-c-k-c0x00ffffff-no-rj";

describe("parseChannelAvatar：從頻道頁讀頭像（og:image）", () => {
  it("讀 og:image_尺寸改成 176px（顯示只要 44px，不必載 900px 的原圖）", () => {
    const html = `<html><head><meta property="og:image" content="${AVATAR}"></head></html>`;

    expect(parseChannelAvatar(html)).toBe("https://yt3.googleusercontent.com/ytc/AIdro_abc123=s176-c-k-c0x00ffffff-no-rj");
  });

  it("屬性順序不同、網址裡的 &amp; 也讀得出來", () => {
    const html = `<meta content="https://yt3.ggpht.com/a/b=s88?x=1&amp;y=2" property="og:image" />`;

    expect(parseChannelAvatar(html)).toBe("https://yt3.ggpht.com/a/b=s176?x=1&y=2");
  });

  it("沒有 og:image 時_改讀 ytInitialData 裡的頭像（JSON 跳脫字元要還原）", () => {
    const html = `<script>var ytInitialData = {"header":{"avatar":{"thumbnails":[{"url":"https://yt3.googleusercontent.com/abc=s48-c-k\\u0026v=1","width":48}]}}};</script>`;

    expect(parseChannelAvatar(html)).toBe("https://yt3.googleusercontent.com/abc=s176-c-k&v=1");
  });

  it("協定相對網址_補成 https", () => {
    expect(parseChannelAvatar(`<meta property="og:image" content="//yt3.ggpht.com/abc=s900-c-k">`)).toBe("https://yt3.ggpht.com/abc=s176-c-k");
  });

  it("沒有尺寸參數的網址_原樣保留", () => {
    expect(parseChannelAvatar(`<meta property="og:image" content="https://yt3.ggpht.com/abc">`)).toBe("https://yt3.ggpht.com/abc");
  });

  it("同意頁、錯誤頁或 YouTube 的通用圖片（不是頭像的網域）_null", () => {
    expect(parseChannelAvatar("<html><body>Before you continue to YouTube</body></html>")).toBeNull();
    expect(parseChannelAvatar(`<meta property="og:image" content="https://www.youtube.com/img/desktop/yt_1200.png">`)).toBeNull();
    expect(parseChannelAvatar(`<meta property="og:image" content="">`)).toBeNull();
    expect(parseChannelAvatar(`<meta property="og:image" content="javascript:alert(1)">`)).toBeNull();
  });
});

describe("parseChannelId：從頻道頁讀頻道 id", () => {
  it("優先讀 canonical 網址", () => {
    expect(parseChannelId(`<link rel="canonical" href="https://www.youtube.com/channel/${CH}">`)).toBe(CH);
  });

  it("沒有 canonical 時讀 externalId", () => {
    expect(parseChannelId(`{"externalId":"${CH}"}`)).toBe(CH);
  });

  it("都沒有_null", () => {
    expect(parseChannelId("<html></html>")).toBeNull();
  });
});
