import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { externalAssetUrl, externalFetch, externalUrl } from "./external-url";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("externalUrl", () => {
  it("沒設定 DEV_EXTERNAL_ORIGIN 時原樣回傳", () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
    expect(externalUrl("https://api.twitch.tv/helix/users?login=a")).toBe("https://api.twitch.tv/helix/users?login=a");
  });

  it("開發環境有設定時，只換掉 origin，保留路徑與查詢字串", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    expect(externalUrl("https://sg-public-api.hoyolab.com/event/luna/os/info?act_id=x")).toBe(
      "http://127.0.0.1:4010/event/luna/os/info?act_id=x",
    );
  });

  it("production 一律忽略覆寫，避免設定外洩到正式環境", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    expect(externalUrl("https://id.twitch.tv/oauth2/token")).toBe("https://id.twitch.tv/oauth2/token");
  });

  it("production 不讀這個設定_設錯也不影響正式環境", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "mock-server-4010");
    expect(externalUrl("https://id.twitch.tv/oauth2/token")).toBe("https://id.twitch.tv/oauth2/token");
  });

  it("開發環境設錯網址_錯誤指出是哪個變數_不帶值", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "mock-server-4010");
    let message = "";
    try {
      externalUrl("https://id.twitch.tv/oauth2/token");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("DEV_EXTERNAL_ORIGIN：");
    expect(message).not.toContain("mock-server-4010");
  });
});

describe("externalFetch", () => {
  it("帶逾時：外部服務一直沒回應時，時間到就中止", async () => {
    const { impl } = fakeFetch(hangUntilAborted);

    await expect(externalFetch("https://api.twitch.tv/helix/users", {}, { timeoutMs: 10, fetchImpl: impl })).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("預設 15 秒逾時", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { impl, calls } = fakeFetch(() => new Response("ok"));

    await externalFetch("https://www.youtube.com/oembed", {}, { fetchImpl: impl });

    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("開發環境改送假伺服器（只換 origin），method、header、body 原樣傳下去", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    const { impl, calls } = fakeFetch(() => new Response("ok"));

    await externalFetch("https://id.twitch.tv/oauth2/token?x=1", { method: "POST", headers: { "Client-Id": "id" }, body: "a=1" }, { fetchImpl: impl });

    expect(calls[0].url).toBe("http://127.0.0.1:4010/oauth2/token?x=1");
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "Client-Id": "id" }, body: "a=1" });
  });

  it("沒給 fetchImpl 時用全域的 fetch", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
    const global = fakeFetch(() => new Response("ok"));
    vi.stubGlobal("fetch", global.impl);

    expect(await (await externalFetch("https://example.com/a")).text()).toBe("ok");
    expect(global.urls).toEqual(["https://example.com/a"]);
  });

  it("呼叫端自己帶的 signal 也有效：先中止就不等逾時", async () => {
    const controller = new AbortController();
    const { impl } = fakeFetch(hangUntilAborted);

    const pending = externalFetch("https://example.com/", { signal: controller.signal }, { timeoutMs: 60_000, fetchImpl: impl });
    controller.abort(new Error("使用者離開頁面"));

    await expect(pending).rejects.toThrow("使用者離開頁面");
  });
});

describe("externalAssetUrl：瀏覽器直接載入的外部圖片網址", () => {
  it("沒有網址_回 null", () => {
    expect(externalAssetUrl(null)).toBeNull();
    expect(externalAssetUrl(undefined)).toBeNull();
    expect(externalAssetUrl("")).toBeNull();
    expect(externalAssetUrl("   ")).toBeNull();
  });

  it("不是 http(s) 的絕對網址_回 null_不會把奇怪的字串放進 img", () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
    expect(externalAssetUrl("javascript:alert(1)")).toBeNull();
    expect(externalAssetUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(externalAssetUrl("/icons/ui/star.svg")).toBeNull();
    expect(externalAssetUrl("not a url")).toBeNull();
    expect(externalAssetUrl("ftp://example.com/a.png")).toBeNull();
  });

  it("沒設定 DEV_EXTERNAL_ORIGIN_原樣回傳", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
    expect(externalAssetUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  it("協定相對網址（//開頭）_補成 https", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
    expect(externalAssetUrl("//yt3.ggpht.com/abc=s176")).toBe("https://yt3.ggpht.com/abc=s176");
  });

  it("開發環境有設定時_改寫到假伺服器_只換 origin_保留路徑與查詢字串", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4011");
    expect(externalAssetUrl("https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-640x360.jpg?t=1")).toBe(
      "http://127.0.0.1:4011/previews-ttv/live_user_alice-640x360.jpg?t=1",
    );
    expect(externalAssetUrl("//yt3.ggpht.com/abc=s176")).toBe("http://127.0.0.1:4011/abc=s176");
  });

  it("production 一律原樣輸出_設了 DEV_EXTERNAL_ORIGIN 也不改寫", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4011");
    expect(externalAssetUrl("https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/a.png")).toBe("https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/a.png");
  });

  it("production 不讀這個設定_設錯也不影響正式環境", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "mock-server-4011");
    expect(externalAssetUrl("https://i.ytimg.com/vi/x/mqdefault.jpg")).toBe("https://i.ytimg.com/vi/x/mqdefault.jpg");
  });
});
