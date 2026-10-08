import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch as recordFetch } from "@/dev/fake-fetch";
import { hasChineseCaptions, listCaptionTracks, type CaptionTrackInfo } from "./captions";

const VIDEO = "dQw4w9WgXcQ";

type Track = { languageCode: string; kind?: string; vssId?: string; baseUrl: string };

const watchPage = (playerResponse: unknown) =>
  `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};var meta = {"a":"}"};</script></body></html>`;

const playable = (tracks: Track[] | null) => ({
  playabilityStatus: { status: "OK" },
  ...(tracks ? { captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks, translationLanguages: [{ languageCode: "zh-Hant" }] } } } : {}),
});

/** 每次都回同一頁的假 fetch，calls 是被呼叫的網址 */
function fakeFetch(page: () => Response) {
  const { impl, urls } = recordFetch(page);
  return { impl, calls: urls };
}

const html = (body: string, status = 200) => () => new Response(body, { status, headers: { "content-type": "text/html" } });
const track = (languageCode: string, extra: Partial<Track> = {}): Track => ({
  languageCode,
  vssId: `.${languageCode}`,
  baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=${languageCode}`,
  ...extra,
});
const info = (languageCode: string, extra: Partial<CaptionTrackInfo> = {}): CaptionTrackInfo => ({ languageCode, automatic: false, translated: false, ...extra });

afterEach(() => vi.unstubAllEnvs());

describe("listCaptionTracks", () => {
  it("列出影片的字幕軌：語言、是不是自動產生、是不是自動翻譯", async () => {
    const tracks = [
      track("ko"),
      track("ko", { kind: "asr", vssId: "a.ko" }),
      track("zh-TW"),
      track("zh-Hant", { baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=ko&tlang=zh-Hant` }),
    ];
    const { impl } = fakeFetch(html(watchPage(playable(tracks))));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({
      ok: true,
      tracks: [info("ko"), info("ko", { automatic: true }), info("zh-TW"), info("zh-Hant", { translated: true })],
    });
  });

  it("影片沒有任何字幕_空清單（不是失敗）", async () => {
    const { impl } = fakeFetch(html(watchPage(playable(null))));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({ ok: true, tracks: [] });
  });

  it("要求驗證不是機器人（雲端主機常見）→ blocked", async () => {
    const page = watchPage({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } });
    const { impl } = fakeFetch(html(page));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("HTTP 429 → blocked；影片頁面讀取失敗 → unavailable", async () => {
    expect(await listCaptionTracks(VIDEO, { fetchImpl: fakeFetch(html("Too Many Requests", 429)).impl })).toMatchObject({ ok: false, reason: "blocked" });
    expect(await listCaptionTracks(VIDEO, { fetchImpl: fakeFetch(html("oops", 500)).impl })).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("網路例外 → error，不往外丟", async () => {
    const { impl } = recordFetch(() => {
      throw new TypeError("fetch failed");
    });

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toMatchObject({ ok: false, reason: "error" });
  });

  it("影片 ID 格式錯誤_不發請求", async () => {
    const { impl, calls } = fakeFetch(html(""));

    expect(await listCaptionTracks("bad id!", { fetchImpl: impl })).toMatchObject({ ok: false, reason: "error" });
    expect(calls).toHaveLength(0);
  });

  it("請求經過 externalUrl（開發時導向假伺服器）", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    const { impl, calls } = fakeFetch(html(watchPage(playable(null))));

    await listCaptionTracks(VIDEO, { fetchImpl: impl });

    expect(calls[0]).toBe(`http://127.0.0.1:4010/watch?v=${VIDEO}`);
  });
});

describe("hasChineseCaptions", () => {
  it.each(["zh-Hant", "zh-TW", "zh-HK", "zh", "zh-Hans", "zh-CN", "ZH-tw"])("人工上傳的 %s 字幕_算有中文", (languageCode) => {
    expect(hasChineseCaptions([info("ko"), info(languageCode)])).toBe(true);
  });

  it("自動產生（asr）的中文字幕_不算", () => {
    expect(hasChineseCaptions([info("zh", { automatic: true })])).toBe(false);
  });

  it("自動翻譯成中文的_不算", () => {
    expect(hasChineseCaptions([info("zh-Hant", { translated: true })])).toBe(false);
  });

  it("只有韓文、英文或其他語言_不算", () => {
    expect(hasChineseCaptions([info("ko"), info("en"), info("ja")])).toBe(false);
    expect(hasChineseCaptions([])).toBe(false);
  });
});
