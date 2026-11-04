import { describe, expect, it, vi } from "vitest";
import { byUrl, fakeFetch as recordFetch } from "@/dev/fake-fetch";
import { hasChineseCaptions, listCaptionTracks, type CaptionTrackInfo } from "./captions";

const VIDEO = "dQw4w9WgXcQ";

type Track = { languageCode: string; kind?: string; vssId?: string; baseUrl: string };

const watchPage = (playerResponse: unknown) =>
  `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};var meta = {"a":"}"};</script></body></html>`;

const playable = (tracks: Track[] | null) => ({
  playabilityStatus: { status: "OK" },
  ...(tracks ? { captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks, translationLanguages: [{ languageCode: "zh-Hant" }] } } } : {}),
});

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

  it("YouTube 的提示是韓文（送 Accept-Language: ko-KR）_一樣認得出要求驗證 → blocked", async () => {
    const page = watchPage({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "봇이 아님을 확인하려면 로그인하세요" } });

    expect(await listCaptionTracks(VIDEO, { fetchImpl: fakeFetch(html(page)).impl })).toMatchObject({ ok: false, reason: "blocked" });
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

describe("listCaptionTracks：觀看頁讀不到時改問第二個來源（InnerTube 的 ANDROID 用戶端）", () => {
  const BOT_CHECK = { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } };
  const json = (body: unknown) => () => Response.json(body);
  const refused = () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  };
  const sources = (watch: () => Response, player: () => Response) =>
    recordFetch(
      byUrl([
        [/\/watch\?v=/, watch],
        [/\/youtubei\/v1\/player/, player],
      ]),
    );
  const WITH_CHINESE = playable([track("ko"), track("zh-TW")]);
  const LISTED = { ok: true, tracks: [info("ko"), info("zh-TW")] };

  it.each([
    ["要求驗證不是機器人", html(watchPage(BOT_CHECK))],
    ["HTTP 429", html("Too Many Requests", 429)],
    ["被導到同意頁、沒有播放資訊", html('<form action="https://consent.youtube.com/save">')],
    ["讀取失敗（HTTP 500）", html("oops", 500)],
    ["連線逾時", refused],
  ])("觀看頁%s_第二個來源讀得到字幕清單就算成功", async (_name, watch) => {
    const { impl } = sources(watch, json(WITH_CHINESE));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual(LISTED);
  });

  it("第二個來源用 POST 問 youtubei/v1/player，帶影片 id 與 ANDROID 用戶端；不帶 cookie，網址也沒有金鑰", async () => {
    const { impl, calls } = sources(html(watchPage(BOT_CHECK)), json(WITH_CHINESE));

    await listCaptionTracks(VIDEO, { fetchImpl: impl });

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://www.youtube.com/youtubei/v1/player?prettyPrint=false");
    expect(calls[1].init.method).toBe("POST");
    expect(calls[1].body).toMatchObject({ videoId: VIDEO, context: { client: { clientName: "ANDROID" } } });
    expect(new Headers(calls[1].init.headers).get("cookie")).toBeNull();
  });

  it("觀看頁讀得到_不問第二個來源", async () => {
    const { impl, calls } = sources(html(watchPage(WITH_CHINESE)), json(playable(null)));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual(LISTED);
    expect(calls).toHaveLength(1);
  });

  it("觀看頁整段沒有字幕資料_再問第二個來源，雲端主機拿到的觀看頁可能少了這段，人工上傳的中文字幕才不會被判成沒有", async () => {
    const { impl, calls } = sources(html(watchPage(playable(null))), json(WITH_CHINESE));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual(LISTED);
    expect(calls).toHaveLength(2);
  });

  it("觀看頁沒有字幕資料、第二個來源也沒有_是空清單", async () => {
    const { impl } = sources(html(watchPage(playable(null))), json(playable(null)));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({ ok: true, tracks: [] });
  });

  it("觀看頁沒有字幕資料、第二個來源讀不到_照觀看頁的算空清單", async () => {
    const { impl } = sources(html(watchPage(playable(null))), json(BOT_CHECK));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({ ok: true, tracks: [] });
  });

  it("觀看頁有字幕、只是沒有中文_不問第二個來源", async () => {
    const { impl, calls } = sources(html(watchPage(playable([track("ko")]))), json(WITH_CHINESE));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({ ok: true, tracks: [info("ko")] });
    expect(calls).toHaveLength(1);
  });

  it("第二個來源回影片沒有任何字幕_是空清單（不是失敗）", async () => {
    const { impl } = sources(html(watchPage(BOT_CHECK)), json(playable(null)));

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toEqual({ ok: true, tracks: [] });
  });

  it.each([
    ["也要求驗證", json(BOT_CHECK)],
    ["HTTP 429", html("Too Many Requests", 429)],
    ["回的不是 JSON", html("<html>blocked</html>")],
    ["回的 JSON 不是播放資訊（當成沒有字幕的話會誤判成沒有中文）", json({ error: { code: 400 } })],
    ["連線逾時", refused],
  ])("兩個都讀不到（第二個來源%s）→ 失敗，原因照觀看頁的", async (_name, player) => {
    const { impl } = sources(html(watchPage(BOT_CHECK)), player);

    expect(await listCaptionTracks(VIDEO, { fetchImpl: impl })).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("影片 ID 格式錯誤_兩個來源都不問", async () => {
    const { impl, calls } = sources(html(""), json(WITH_CHINESE));

    expect(await listCaptionTracks("bad id!", { fetchImpl: impl })).toMatchObject({ ok: false, reason: "error" });
    expect(calls).toHaveLength(0);
  });

  it("第二個來源的請求也經過 externalUrl（開發時導向假伺服器，不會打到真的 YouTube）", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    const { impl, calls } = sources(html(watchPage(BOT_CHECK)), json(WITH_CHINESE));

    await listCaptionTracks(VIDEO, { fetchImpl: impl });

    expect(calls[1].url).toBe("http://127.0.0.1:4010/youtubei/v1/player?prettyPrint=false");
  });
});

describe("hasChineseCaptions", () => {
  it.each(["zh-Hant", "zh-TW", "zh-HK", "zh", "zh-Hans", "zh-CN", "ZH-tw"])("人工上傳的 %s 字幕_算有中文", (languageCode) => {
    expect(hasChineseCaptions([info("ko"), info(languageCode)])).toBe(true);
  });

  // YouTube 允許上傳者選地區與文字的細分語言 簡體與繁體都要算
  it.each(["zh-Hans-CN", "zh-Hant-TW", "zh-Hant-HK", "zh-SG", "zh-MO", "cmn", "cmn-Hans", "cmn-TW", "yue", "yue-HK"])("人工上傳的細分語言 %s_也算有中文", (languageCode) => {
    expect(hasChineseCaptions([info(languageCode)])).toBe(true);
  });

  it("開頭碰巧相同的其他語言_不算", () => {
    expect(hasChineseCaptions([info("zu"), info("zza"), info("yuf"), info("cmo")])).toBe(false);
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
