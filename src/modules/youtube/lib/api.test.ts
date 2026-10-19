import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { stubYoutubeEnv } from "@/dev/test-env";

stubYoutubeEnv();

const { checkIsShort, fetchChannelAvatar, fetchChannelFeed, fetchVideoInfo, resolveHandle } = await import("./api");

const CH = "UC" + "x".repeat(22);
const redirect = (location: string, status = 303) => new Response(null, { status, headers: { Location: location } });
const page = (avatar: string) => new Response(`<html><head><meta property="og:image" content="${avatar}"></head></html>`, { headers: { "Content-Type": "text/html" } });

// AbortSignal.timeout 的 spy 要還原 全域的 fetch 由 vitest 設定自動換回
afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkIsShort：請求 /shorts/<id> 判斷是不是 Shorts", () => {
  it("回 200_是 Shorts；請求不跟著轉址", async () => {
    const youtube = fakeFetch(() => new Response("<html></html>", { status: 200 }));
    vi.stubGlobal("fetch", youtube.impl);

    expect(await checkIsShort("sssssssssss")).toBe(true);
    expect(youtube.urls).toEqual(["https://www.youtube.com/shorts/sssssssssss"]);
    expect(youtube.calls[0].init.redirect).toBe("manual");
  });

  it.each([
    ["相對網址", "/watch?v=wwwwwwwwwww"],
    ["完整網址", "https://www.youtube.com/watch?v=wwwwwwwwwww"],
  ])("轉址到 /watch（%s）_是一般影片", async (_name, location) => {
    vi.stubGlobal("fetch", fakeFetch(() => redirect(location)).impl);

    expect(await checkIsShort("wwwwwwwwwww")).toBe(false);
  });

  it.each([
    ["轉址到同意頁", () => redirect("https://consent.youtube.com/m?continue=https://www.youtube.com/shorts/x")],
    ["轉址但沒有 Location", () => new Response(null, { status: 302 })],
    ["Location 不是合法網址", () => redirect("http://[broken")],
    ["被擋（429）", () => new Response("Too Many Requests", { status: 429 })],
    ["影片不存在（404）", () => new Response("not found", { status: 404 })],
  ])("%s_無法判斷（null）", async (_name, respond) => {
    vi.stubGlobal("fetch", fakeFetch(respond).impl);

    expect(await checkIsShort("xxxxxxxxxxx")).toBeNull();
  });

  it("連線失敗_照常丟出（跟頭像一樣，由 service 記下錯誤種類後當一般影片）", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).impl);

    await expect(checkIsShort("xxxxxxxxxxx")).rejects.toBeInstanceOf(TypeError);
  });

  it("一直沒回應_時間到丟出逾時錯誤", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(10));
    vi.stubGlobal("fetch", fakeFetch(hangUntilAborted).impl);

    await expect(checkIsShort("xxxxxxxxxxx")).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("推送時照一般的 YouTube 請求等 15 秒；清理時指定 timeoutMs（每支最多等 5 秒）就用指定的逾時", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fakeFetch(() => new Response("<html></html>", { status: 200 })).impl);

    await checkIsShort("sssssssssss");
    expect(timeout).toHaveBeenLastCalledWith(15_000);

    expect(await checkIsShort("sssssssssss", { timeoutMs: 5_000 })).toBe(true);
    expect(timeout).toHaveBeenLastCalledWith(5_000);
  });
});

describe("fetchChannelFeed：逾時可以調短（清理 Shorts 時每個頻道最多等 5 秒）", () => {
  const feed = () => new Response(`<feed><title>뉴진스</title></feed>`, { headers: { "Content-Type": "application/atom+xml" } });

  it("追蹤頻道時照一般的 YouTube 請求等 15 秒", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fakeFetch(feed).impl);

    expect(await fetchChannelFeed(CH)).toEqual({ title: "뉴진스", entries: [] });
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it("指定 timeoutMs_用指定的逾時", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fakeFetch(feed).impl);

    await fetchChannelFeed(CH, { timeoutMs: 5_000 });

    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(timeout).not.toHaveBeenCalledWith(15_000);
  });
});

describe("頻道查詢遇到 YouTube 的錯誤狀態：丟出的錯誤帶狀態碼，log 看得出是哪一種失敗", () => {
  it.each([
    ["讀頻道的 RSS", () => fetchChannelFeed(CH)],
    ["把 @handle 換成頻道 id", () => resolveHandle("NewJeans_official")],
  ])("%s_YouTube 回 503", async (_name, run) => {
    vi.stubGlobal("fetch", fakeFetch(() => new Response("Service Unavailable", { status: 503 })).impl);

    await expect(run()).rejects.toMatchObject({ status: 503 });
  });
});

describe("fetchChannelAvatar：讀頻道頁的頭像", () => {
  it("頻道 id 讀 /channel/ 頁_回傳縮小過的頭像網址", async () => {
    const youtube = fakeFetch(() => page("https://yt3.googleusercontent.com/abc=s900-c-k"));
    vi.stubGlobal("fetch", youtube.impl);

    expect(await fetchChannelAvatar(CH)).toBe("https://yt3.googleusercontent.com/abc=s176-c-k");
    expect(youtube.urls).toEqual([`https://www.youtube.com/channel/${CH}`]);
  });

  it("@handle 讀 /@ 頁", async () => {
    const youtube = fakeFetch(() => page("https://yt3.ggpht.com/h=s88"));
    vi.stubGlobal("fetch", youtube.impl);

    expect(await fetchChannelAvatar("@NewJeans_official")).toBe("https://yt3.ggpht.com/h=s176");
    expect(youtube.urls).toEqual(["https://www.youtube.com/@NewJeans_official"]);
  });

  it("頻道不存在或被擋（非 2xx）_null_不丟錯", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new Response("not found", { status: 404 })).impl);

    expect(await fetchChannelAvatar(CH)).toBeNull();
  });

  it("不是頻道 id 或 handle_不發請求_null", async () => {
    const youtube = fakeFetch(() => page("https://yt3.ggpht.com/h"));
    vi.stubGlobal("fetch", youtube.impl);

    expect(await fetchChannelAvatar("https://evil.example.com/")).toBeNull();
    expect(youtube.urls).toEqual([]);
  });

  it("一直沒回應_時間到丟出逾時錯誤（由 service 記錄後退回文字頭像）", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(10));
    vi.stubGlobal("fetch", fakeFetch(hangUntilAborted).impl);

    await expect(fetchChannelAvatar(CH)).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("fetchVideoInfo：任意影片的標題與頻道（oEmbed）", () => {
  it("讀 oEmbed_回傳標題、頻道名稱與網址", async () => {
    const youtube = fakeFetch(() => Response.json({ title: "새 영상", author_name: "NewJeans", author_url: "https://www.youtube.com/@NewJeans_official" }));
    vi.stubGlobal("fetch", youtube.impl);

    expect(await fetchVideoInfo("dQw4w9WgXcQ")).toEqual({ title: "새 영상", channelName: "NewJeans", channelUrl: "https://www.youtube.com/@NewJeans_official" });
    expect(youtube.urls[0]).toBe(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`);
  });

  it("影片不存在或私人影片（非 2xx）_null", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new Response("Unauthorized", { status: 401 })).impl);

    expect(await fetchVideoInfo("dQw4w9WgXcQ")).toBeNull();
  });

  it("連線失敗_照常丟出（跟頭像一樣，由 service 記下錯誤種類後當作讀不到）", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).impl);

    await expect(fetchVideoInfo("dQw4w9WgXcQ")).rejects.toBeInstanceOf(TypeError);
  });
});
