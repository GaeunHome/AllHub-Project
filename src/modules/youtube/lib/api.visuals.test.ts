import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { stubYoutubeEnv } from "@/dev/test-env";

stubYoutubeEnv();

const { fetchChannelAvatar, fetchVideoInfo } = await import("./api");

const CH = "UC" + "x".repeat(22);
const page = (avatar: string) => new Response(`<html><head><meta property="og:image" content="${avatar}"></head></html>`, { headers: { "Content-Type": "text/html" } });

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("頭像只是裝飾_逾時比一般 YouTube 請求短（5 秒）", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fakeFetch(() => page("https://yt3.ggpht.com/h")).impl);

    await fetchChannelAvatar(CH);

    expect(timeout).toHaveBeenCalledWith(5_000);
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

  it("影片不存在、私人影片或連線失敗_null", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new Response("Unauthorized", { status: 401 })).impl);
    expect(await fetchVideoInfo("dQw4w9WgXcQ")).toBeNull();

    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).impl);
    expect(await fetchVideoInfo("dQw4w9WgXcQ")).toBeNull();
  });
});
