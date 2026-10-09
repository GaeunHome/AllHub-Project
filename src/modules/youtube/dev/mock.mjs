// 假的 YouTube／WebSub hub／AI 與圖片 CDN；特殊輸入（@nobody、@noavatar…、影片 id 開頭 nocaptions／zhsubs／zhauto／nothumb、金鑰含 bad、MOCK_AI_MS_PER_LINE）見 docs/development.md「假伺服器的特殊輸入」
import { createHash } from "node:crypto";

/** 依 handle 產生固定的假頻道 id（UC + 22 碼） */
const channelIdOf = (handle) => "UC" + Buffer.from(handle).toString("base64url").padEnd(22, "x").slice(0, 22);
/** 從假頻道 id 還原 handle 的開頭（只用來決定頭像的字與要不要有頭像） */
const handleOf = (channelId) => Buffer.from(channelId.slice(2).replace(/x+$/, ""), "base64url").toString("utf8");
/** 每個頻道的 RSS feed 有三支影片（追蹤時會補進影片清單）；影片 id 依頻道 id 雜湊，不同頻道不會撞在一起 */
const feedEntries = (channelId) => {
  const tag = createHash("sha1").update(channelId).digest("base64url").replace(/[-_]/g, "a");
  const hour = 3600_000;
  return [
    { videoId: `zhsubs${tag.slice(0, 5)}`, title: "新歌 MV（有中文字幕）", ago: 3 * hour },
    { videoId: `feed${tag.slice(0, 6)}1`, title: "直播精華", ago: 30 * hour },
    { videoId: `feed${tag.slice(0, 6)}2`, title: "幕後花絮", ago: 5 * 24 * hour },
  ];
};
/** 從 @帳號 產生的頻道用帳號當名字，截圖分得出是哪個頻道；直接用 UC id 加的頻道解不出帳號，用 id 末四碼 */
const feedName = (channelId) => {
  const handle = handleOf(channelId);
  return /^[\w.-]{1,40}$/.test(handle) ? handle : channelId.slice(-4);
};
const feedXml = (channelId) =>
  feedEntries(channelId)
    .map(({ videoId, title, ago }) => `<entry><yt:videoId>${videoId}</yt:videoId><yt:channelId>${channelId}</yt:channelId><title>${title}</title><published>${new Date(Date.now() - ago).toISOString()}</published></entry>`)
    .join("");

/** 頻道頁：@noavatar 開頭的頻道沒有 og:image，畫面會退回文字頭像 */
const channelPage = (channelId) => {
  const avatar = handleOf(channelId).startsWith("noavatar") ? "" : `<meta property="og:image" content="https://yt3.googleusercontent.com/ytc/${channelId}=s900-c-k-c0x00ffffff-no-rj">`;
  return `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${channelId}">${avatar}</head></html>`;
};

// 內建的假字幕給固定譯文，畫面上看得出中文字幕疊在影片上；其他句子（例如上傳的字幕檔）回「〔中〕原文」
const KOREAN_LINES = {
  "안녕하세요 여러분": "大家好",
  "오늘은 특별한 날이에요": "今天是特別的日子",
  "같이 노래해요": "一起唱吧",
  "정말 감사합니다": "真的很謝謝大家",
  "다음에 또 만나요": "下次見",
  사랑해요: "愛你們",
  화이팅: "加油",
  안녕: "掰掰",
};

export function handle({ req, url, body, json, text, image }) {
  // ---------- YouTube ----------
  if (url.pathname.startsWith("/@")) {
    const name = decodeURIComponent(url.pathname.slice(2));
    if (name === "nobody") return text(404, "not found");
    return text(200, channelPage(channelIdOf(name)), "text/html");
  }
  if (url.pathname.startsWith("/channel/")) return text(200, channelPage(url.pathname.split("/")[2] ?? ""), "text/html");

  // ---------- 圖片 CDN（i.ytimg.com 的縮圖、yt3 的頻道頭像） ----------
  if (url.pathname.startsWith("/vi/")) {
    const videoId = url.pathname.split("/")[2] ?? "";
    if (videoId.startsWith("nothumb")) return text(404, "not found");
    return image(videoId, { width: 320, height: 180 });
  }
  if (url.pathname.startsWith("/ytc/")) {
    const channelId = url.pathname.slice("/ytc/".length).split("=")[0];
    return image(handleOf(channelId).slice(0, 2).toUpperCase() || "YT", { width: 176, height: 176, round: true });
  }
  if (url.pathname === "/feeds/videos.xml") {
    const id = url.searchParams.get("channel_id") ?? "";
    return text(200, `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><title>模擬頻道 ${feedName(id)}</title>${feedXml(id)}</feed>`, "application/atom+xml");
  }
  if (url.pathname === "/watch") {
    const v = url.searchParams.get("v") ?? "";
    const track = (languageCode, kind) => ({ languageCode, ...(kind ? { kind, vssId: `a.${languageCode}` } : { vssId: `.${languageCode}` }), baseUrl: `https://www.youtube.com/api/timedtext?v=${v}&lang=${languageCode}${kind ? `&kind=${kind}` : ""}` });
    const chinese = v.startsWith("zhsubs") ? [track("zh-TW")] : v.startsWith("zhauto") ? [track("zh", "asr")] : [];
    const tracks = v.startsWith("nocaptions") ? [] : [track("ko"), ...chinese];
    const player = { playabilityStatus: { status: "OK" }, captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } };
    return text(200, `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></body></html>`, "text/html");
  }
  if (url.pathname === "/api/timedtext") {
    return json(200, { events: Object.keys(KOREAN_LINES).map((utf8, i) => ({ tStartMs: i * 2000, dDurationMs: 1900, segs: [{ utf8 }] })) });
  }
  if (url.pathname === "/oembed") return json(200, { title: "模擬影片標題", author_name: "模擬頻道", author_url: "https://www.youtube.com/@mockchannel" });

  // ---------- WebSub hub ----------
  if (url.pathname === "/subscribe" && req.method === "POST") {
    const form = new URLSearchParams(body);
    const mode = form.get("hub.mode");
    setTimeout(async () => {
      // 跟真的 hub 一樣在 callback 上「加上」參數：callback 原本的 query（驗證用的 k）要保留
      const verify = new URL(form.get("hub.callback"));
      const params = { "hub.mode": mode, "hub.topic": form.get("hub.topic"), "hub.challenge": `challenge-${Date.now()}`, ...(mode === "subscribe" ? { "hub.lease_seconds": "432000" } : {}) };
      for (const [name, value] of Object.entries(params)) verify.searchParams.set(name, value);
      try {
        const r = await fetch(verify);
        console.log(`[mock] hub 確認 ${mode} → ${r.status}`);
      } catch (error) {
        console.log(`[mock] hub 確認失敗：${error.message}`);
      }
    }, 500);
    return json(202);
  }

  // ---------- AI ----------
  if (["/v1/messages", "/v1/chat/completions"].includes(url.pathname) || url.pathname.startsWith("/v1beta/models/")) {
    const aiKey = req.headers["x-api-key"] ?? req.headers["x-goog-api-key"] ?? req.headers.authorization ?? "";
    if (String(aiKey).includes("bad")) return json(401, { error: { message: "invalid api key" } });
    const request = JSON.parse(body);
    const kind = url.pathname === "/v1/messages" ? "claude" : url.pathname === "/v1/chat/completions" ? "openai" : "gemini";
    const user = kind === "claude" ? request.messages[0].content : kind === "openai" ? request.messages.at(-1).content : request.contents[0].parts[0].text;
    const input = JSON.parse(user.slice(0, user.lastIndexOf("}") + 1));
    const text = JSON.stringify({ lines: input.lines.map((line) => KOREAN_LINES[line] ?? `〔中〕${line}`) });
    // 真實的 AI 句數越多回得越慢，模擬出來才看得出播放位置的小批次有沒有先出現
    const msPerLine = Number(process.env.MOCK_AI_MS_PER_LINE ?? 80);
    const delayMs = msPerLine > 0 ? 400 + msPerLine * input.lines.length : 0;
    return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() => {
      if (kind === "claude") return json(200, { content: [{ type: "text", text }], stop_reason: "end_turn" });
      if (kind === "openai") return json(200, { choices: [{ message: { content: text }, finish_reason: "stop" }] });
      return json(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
    });
  }
  return false;
}
