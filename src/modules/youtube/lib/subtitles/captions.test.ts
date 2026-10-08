import { afterEach, describe, expect, it, vi } from "vitest";
import { byUrl, fakeFetch as recordFetch } from "@/dev/fake-fetch";
import { fetchKoreanCaptions } from "./captions";

const VIDEO = "dQw4w9WgXcQ";

type Track = { languageCode: string; kind?: string; baseUrl: string; name?: unknown };

function watchPage(playerResponse: unknown): string {
  return `<html><head></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};var meta = {"a":"}"};</script></body></html>`;
}

function playable(tracks: Track[] | null) {
  return {
    playabilityStatus: { status: "OK" },
    ...(tracks ? { captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } } : {}),
  };
}

const json3 = (events: unknown[]) => JSON.stringify({ events });

/** 依網址回應的假 fetch，calls 是被呼叫的網址 */
function fakeFetch(routes: Array<[RegExp, () => Response]>) {
  const { impl, urls } = recordFetch(byUrl(routes));
  return { impl, calls: urls };
}

const html = (body: string, init?: ResponseInit) => () => new Response(body, { headers: { "content-type": "text/html" }, ...init });
const json = (body: string) => () => new Response(body, { headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllEnvs());

describe("fetchKoreanCaptions", () => {
  it("影片 ID 格式錯誤時不發請求", async () => {
    const { impl, calls } = fakeFetch([]);
    const result = await fetchKoreanCaptions("bad id!", { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "error" });
    expect(calls).toHaveLength(0);
  });

  it("優先取人工韓文字幕，用 json3 下載並轉成 cue", async () => {
    const tracks: Track[] = [
      { languageCode: "ko", kind: "asr", baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=ko&kind=asr" },
      { languageCode: "en", baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en" },
      { languageCode: "ko", baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=ko&fmt=srv3" },
    ];
    const { impl, calls } = fakeFetch([
      [/\/watch\?v=/, html(watchPage(playable(tracks)))],
      [/timedtext.*lang=ko(?!.*kind=asr)/, json(json3([
        { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "안녕" }, { utf8: "하세요" }] },
        { tStartMs: 1500, dDurationMs: 1000 },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "\n" }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: "여러분 " }] },
      ]))],
    ]);

    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });

    expect(result).toEqual({
      ok: true,
      kind: "manual",
      language: "ko",
      cues: [
        { start: 0, end: 1500, text: "안녕하세요" },
        { start: 3000, end: 5000, text: "여러분" },
      ],
    });
    const download = new URL(calls[1]);
    expect(download.searchParams.get("fmt")).toBe("json3");
    expect(download.searchParams.get("kind")).toBeNull();
  });

  it("沒有人工字幕時改用自動字幕（ko-KR 也算），重疊的時間會截短", async () => {
    const tracks: Track[] = [{ languageCode: "ko-KR", kind: "asr", baseUrl: "/api/timedtext?v=x&lang=ko-KR&kind=asr" }];
    const { impl, calls } = fakeFetch([
      [/\/watch\?v=/, html(watchPage(playable(tracks)))],
      [/timedtext/, json(json3([
        { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "첫" }, { utf8: " 줄" }] },
        { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: "둘째" }] },
      ]))],
    ]);

    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });

    expect(result).toEqual({
      ok: true,
      kind: "auto",
      language: "ko-KR",
      cues: [
        { start: 0, end: 2000, text: "첫 줄" },
        { start: 2000, end: 5000, text: "둘째" },
      ],
    });
    expect(calls[1].startsWith("https://www.youtube.com/api/timedtext")).toBe(true);
  });

  it("有字幕但沒有韓文 → no_korean", async () => {
    const tracks: Track[] = [{ languageCode: "en", baseUrl: "https://www.youtube.com/api/timedtext?lang=en" }];
    const { impl } = fakeFetch([[/\/watch\?v=/, html(watchPage(playable(tracks)))]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "no_korean" });
  });

  it("影片完全沒有字幕 → no_korean", async () => {
    const { impl } = fakeFetch([[/\/watch\?v=/, html(watchPage(playable(null)))]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "no_korean" });
  });

  it("要求登入確認不是機器人 → blocked，訊息提示改上傳字幕檔", async () => {
    const page = watchPage({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } });
    const { impl } = fakeFetch([[/\/watch\?v=/, html(page)]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
    if (!result.ok) expect(result.message).toContain("yt-dlp");
  });

  it("被導到同意頁（沒有 player response）→ blocked", async () => {
    const { impl } = fakeFetch([[/\/watch\?v=/, html('<form action="https://consent.youtube.com/save">')]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("HTTP 429 → blocked", async () => {
    const { impl } = fakeFetch([[/\/watch\?v=/, html("Too Many Requests", { status: 429 })]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("影片不存在或不可播放 → unavailable", async () => {
    const page = watchPage({ playabilityStatus: { status: "ERROR", reason: "Video unavailable" } });
    const { impl } = fakeFetch([[/\/watch\?v=/, html(page)]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("字幕下載回空內容（需要 PO token）→ blocked", async () => {
    const tracks: Track[] = [{ languageCode: "ko", baseUrl: "https://www.youtube.com/api/timedtext?lang=ko" }];
    const { impl } = fakeFetch([
      [/\/watch\?v=/, html(watchPage(playable(tracks)))],
      [/timedtext/, () => new Response("", { status: 200 })],
    ]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("字幕內容不是預期格式 → error", async () => {
    const tracks: Track[] = [{ languageCode: "ko", baseUrl: "https://www.youtube.com/api/timedtext?lang=ko" }];
    const { impl } = fakeFetch([
      [/\/watch\?v=/, html(watchPage(playable(tracks)))],
      [/timedtext/, json("{not json")],
    ]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "error" });
  });

  it("網路例外 → error，不往外丟", async () => {
    const { impl } = recordFetch(() => {
      throw new TypeError("fetch failed");
    });
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, reason: "error" });
  });

  it("標題或說明裡含有 ytInitialPlayerResponse = { 字樣時，仍找到真正的播放資訊", async () => {
    const tracks: Track[] = [{ languageCode: "ko", baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=ko" }];
    const page =
      `<html><head><title>ytInitialPlayerResponse = {} 해설 - YouTube</title>` +
      `<meta name="description" content="var ytInitialPlayerResponse = {&quot;a&quot;:1}"></head>` +
      `<body><script>var ytInitialData = {"description":"ytInitialPlayerResponse = {\\"x\\":1}"};</script>` +
      `<script>var ytInitialPlayerResponse = ${JSON.stringify(playable(tracks))};</script></body></html>`;
    const { impl } = fakeFetch([
      [/\/watch\?v=/, html(page)],
      [/timedtext/, json(json3([{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "안녕" }] }]))],
    ]);

    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });

    expect(result).toEqual({ ok: true, kind: "manual", language: "ko", cues: [{ start: 0, end: 1000, text: "안녕" }] });
  });

  it.each([
    ["別的網域", "https://evil.example.com/api/timedtext?lang=ko"],
    ["網域只是前綴相同", "https://www.youtube.com.evil.example/api/timedtext?lang=ko"],
    ["相似網域", "https://notyoutube.com/api/timedtext?lang=ko"],
    ["不是 https", "http://www.youtube.com/api/timedtext?lang=ko"],
  ])("字幕網址不是 YouTube 的（%s）→ error，不送出請求", async (_name, baseUrl) => {
    const tracks: Track[] = [{ languageCode: "ko", baseUrl }];
    const { impl, calls } = fakeFetch([[/\/watch\?v=/, html(watchPage(playable(tracks)))]]);

    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });

    expect(result).toMatchObject({ ok: false, reason: "error" });
    expect(calls).toHaveLength(1);
  });

  it("youtube.com 的子網域與相對路徑都接受", async () => {
    const tracks: Track[] = [{ languageCode: "ko", baseUrl: "https://m.youtube.com/api/timedtext?lang=ko" }];
    const { impl, calls } = fakeFetch([
      [/\/watch\?v=/, html(watchPage(playable(tracks)))],
      [/timedtext/, json(json3([{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "안녕" }] }]))],
    ]);
    expect(await fetchKoreanCaptions(VIDEO, { fetchImpl: impl })).toMatchObject({ ok: true });
    expect(new URL(calls[1]).hostname).toBe("m.youtube.com");
  });

  it("擋下時提示的 yt-dlp 指令與 docs/modules.md 一致（包含自動字幕）", async () => {
    const page = watchPage({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } });
    const { impl } = fakeFetch([[/\/watch\?v=/, html(page)]]);
    const result = await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download");
  });

  it("請求會經過 externalUrl（開發時可導向假伺服器）", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    const { impl, calls } = fakeFetch([[/\/watch\?v=/, html(watchPage(playable(null)))]]);
    await fetchKoreanCaptions(VIDEO, { fetchImpl: impl });
    expect(calls[0]).toBe(`http://127.0.0.1:4010/watch?v=${VIDEO}`);
  });
});
