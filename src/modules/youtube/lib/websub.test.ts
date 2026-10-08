import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HubError } from "./api";
import { callbackToken, channelIdFromTopic, parseFeed, parseVerification, subscriptionFailure, topicFor, verifyCallbackToken, verifyHubSignature } from "./websub";

const CHANNEL = "UC" + "x".repeat(22);

describe("topicFor / channelIdFromTopic", () => {
  it("互為反函式", () => {
    const topic = topicFor(CHANNEL);
    expect(topic).toBe(`https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL}`);
    expect(channelIdFromTopic(topic)).toBe(CHANNEL);
  });

  it.each([
    ["別的網域", `https://evil.example.com/xml/feeds/videos.xml?channel_id=${CHANNEL}`],
    ["別的路徑", `https://www.youtube.com/feeds/other?channel_id=${CHANNEL}`],
    ["沒有 channel_id", "https://www.youtube.com/xml/feeds/videos.xml"],
    ["不是網址", "not a url"],
    ["channel_id 格式錯", "https://www.youtube.com/xml/feeds/videos.xml?channel_id=abc"],
  ])("%s → null", (_name, topic) => {
    expect(channelIdFromTopic(topic)).toBeNull();
  });
});

describe("verifyHubSignature", () => {
  const secret = "websub-secret-123";
  const body = "<feed>內容</feed>";
  const sign = (b: string, s = secret) => "sha1=" + createHmac("sha1", s).update(b, "utf8").digest("hex");

  it("正確簽章通過", () => {
    expect(verifyHubSignature(body, sign(body), secret)).toBe(true);
  });

  it.each([
    ["沒有簽章", null],
    ["空字串", ""],
    ["不是 sha1=", "sha256=" + "0".repeat(64)],
    ["用錯密鑰", sign(body, "other-secret-xyz")],
    ["內容被改過", sign(body + " ")],
    ["hex 長度不對", "sha1=abcd"],
  ])("%s → false", (_name, header) => {
    expect(verifyHubSignature(body, header, secret)).toBe(false);
  });

  it("大寫 hex 也接受", () => {
    expect(verifyHubSignature(body, sign(body).toUpperCase().replace("SHA1=", "sha1="), secret)).toBe(true);
  });
});

describe("parseFeed", () => {
  const entry = (id: string, title: string, published = "2026-10-07T08:00:00+00:00") => `
  <entry>
    <id>yt:video:${id}</id>
    <yt:videoId>${id}</yt:videoId>
    <yt:channelId>${CHANNEL}</yt:channelId>
    <title>${title}</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/>
    <author><name>頻道</name><uri>https://www.youtube.com/channel/${CHANNEL}</uri></author>
    <published>${published}</published>
    <updated>2026-10-07T08:05:00.123456+00:00</updated>
  </entry>`;

  const feed = (entries: string, extra = "") => `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <link rel="hub" href="https://pubsubhubbub.appspot.com"/>
  <title>YouTube video feed</title>
  ${extra}
  <updated>2026-10-07T08:05:00+00:00</updated>
  ${entries}
</feed>`;

  it("解析推送通知的影片", () => {
    expect(parseFeed(feed(entry("aaaaaaaaaaa", "새 영상 &amp; &quot;특집&quot; &#39;1&#39; &#x4E2D;")))).toEqual({
      title: "YouTube video feed",
      entries: [
        {
          videoId: "aaaaaaaaaaa",
          channelId: CHANNEL,
          title: `새 영상 & "특집" '1' 中`,
          published: new Date("2026-10-07T08:00:00Z"),
          url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        },
      ],
    });
  });

  it("CDATA 標題", () => {
    expect(parseFeed(feed(entry("bbbbbbbbbbb", "<![CDATA[<b>粗體</b> 標題]]>"))).entries[0].title).toBe("<b>粗體</b> 標題");
  });

  it("頻道 feed（含多筆影片、頻道名稱在第一個 title）", () => {
    const result = parseFeed(feed(entry("ccccccccccc", "一") + entry("ddddddddddd", "二")).replace("YouTube video feed", "뉴진스 NewJeans"));
    expect(result.title).toBe("뉴진스 NewJeans");
    expect(result.entries.map((e) => e.videoId)).toEqual(["ccccccccccc", "ddddddddddd"]);
  });

  it("刪除通知（at:deleted-entry）不產生影片", () => {
    const deleted = `<at:deleted-entry ref="yt:video:eeeeeeeeeee" when="2026-10-07T08:00:00+00:00"><link href="https://www.youtube.com/watch?v=eeeeeeeeeee"/></at:deleted-entry>`;
    expect(parseFeed(feed("", deleted)).entries).toEqual([]);
  });

  it("缺 videoId 或 channelId 的 entry 略過；published 錯誤給 null；沒有 link 時用 videoId 組網址", () => {
    const broken = `<entry><yt:videoId>fffffffffff</yt:videoId><title>x</title></entry>`;
    const noLink = `<entry><yt:videoId>ggggggggggg</yt:videoId><yt:channelId>${CHANNEL}</yt:channelId><title>y</title><published>garbage</published></entry>`;
    expect(parseFeed(feed(broken + noLink)).entries).toEqual([
      { videoId: "ggggggggggg", channelId: CHANNEL, title: "y", published: null, url: "https://www.youtube.com/watch?v=ggggggggggg" },
    ]);
  });

  it("不是 XML 也不會丟錯", () => {
    expect(parseFeed("garbage")).toEqual({ title: null, entries: [] });
  });

  it("超出 Unicode 範圍的數字實體保留原文，不丟錯", () => {
    expect(parseFeed(feed(entry("hhhhhhhhhhh", "a &#99999999; b &#x110000; c &#x4E2D;"))).entries[0].title).toBe("a &#99999999; b &#x110000; c 中");
  });

  it("NUL 與代理區的數字實體也保留原文（解出來存不進資料庫）", () => {
    expect(parseFeed(feed(entry("iiiiiiiiiii", "a &#0; b &#xD800;"))).entries[0].title).toBe("a &#0; b &#xD800;");
  });
});

describe("callbackToken / verifyCallbackToken", () => {
  const secret = "websub-secret-123";
  const OTHER_CHANNEL = "UC" + "y".repeat(22);

  it("token 是 HMAC-SHA256(secret, 'websub:' + 頻道 id) 的 hex，跟頻道與密鑰綁定", () => {
    const token = callbackToken(CHANNEL, secret);
    expect(token).toBe(createHmac("sha256", secret).update(`websub:${CHANNEL}`).digest("hex"));
    expect(callbackToken(OTHER_CHANNEL, secret)).not.toBe(token);
    expect(callbackToken(CHANNEL, "other-secret-xyz")).not.toBe(token);
  });

  it("只有同一頻道的正確 token 通過", () => {
    const token = callbackToken(CHANNEL, secret);
    expect(verifyCallbackToken(CHANNEL, token, secret)).toBe(true);
    expect(verifyCallbackToken(CHANNEL, undefined, secret)).toBe(false);
    expect(verifyCallbackToken(CHANNEL, "", secret)).toBe(false);
    expect(verifyCallbackToken(CHANNEL, token.slice(0, -1), secret)).toBe(false);
    expect(verifyCallbackToken(CHANNEL, token.toUpperCase(), secret)).toBe(false);
    expect(verifyCallbackToken(OTHER_CHANNEL, token, secret)).toBe(false);
  });
});

describe("parseVerification", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);
  const topic = topicFor(CHANNEL);

  it("subscribe：帶 challenge 與 lease", () => {
    expect(parseVerification(params({ "hub.mode": "subscribe", "hub.topic": topic, "hub.challenge": "abc", "hub.lease_seconds": "432000" }))).toEqual({
      mode: "subscribe",
      topic,
      challenge: "abc",
      leaseSeconds: 432000,
    });
  });

  it("unsubscribe：沒有 lease", () => {
    expect(parseVerification(params({ "hub.mode": "unsubscribe", "hub.topic": topic, "hub.challenge": "x" }))).toEqual({
      mode: "unsubscribe",
      topic,
      challenge: "x",
      leaseSeconds: undefined,
    });
  });

  it("denied：帶 reason", () => {
    expect(parseVerification(params({ "hub.mode": "denied", "hub.topic": topic, "hub.reason": "nope" }))).toEqual({ mode: "denied", topic, reason: "nope" });
  });

  it.each([
    ["沒有 mode", { "hub.topic": topic, "hub.challenge": "a" }],
    ["未知 mode", { "hub.mode": "other", "hub.topic": topic, "hub.challenge": "a" }],
    ["沒有 topic", { "hub.mode": "subscribe", "hub.challenge": "a" }],
    ["subscribe 沒有 challenge", { "hub.mode": "subscribe", "hub.topic": topic }],
    ["lease 不是正整數", { "hub.mode": "subscribe", "hub.topic": topic, "hub.challenge": "a", "hub.lease_seconds": "-5" }],
  ])("%s → null", (_name, o) => {
    expect(parseVerification(params(o as Record<string, string>))).toBeNull();
  });

  it.each(["0", "000"])("lease 是 %s（不是正整數）→ null", (lease) => {
    expect(parseVerification(params({ "hub.mode": "subscribe", "hub.topic": topic, "hub.challenge": "a", "hub.lease_seconds": lease }))).toBeNull();
  });

  it.each(["1000000000", "99999999999999999999999999"])("lease %s 超過 10 天 → 夾到 10 天（不讓租約變成幾十年後或 Invalid Date）", (lease) => {
    const result = parseVerification(params({ "hub.mode": "subscribe", "hub.topic": topic, "hub.challenge": "a", "hub.lease_seconds": lease }));
    expect(result).toMatchObject({ leaseSeconds: 10 * 24 * 3600 });
  });

  it("callback 網址上的 k 帶出來當 token（三種 mode 都是）", () => {
    const modes: Record<string, string>[] = [{ "hub.mode": "subscribe", "hub.challenge": "a" }, { "hub.mode": "unsubscribe", "hub.challenge": "a" }, { "hub.mode": "denied" }];
    for (const extra of modes) {
      expect(parseVerification(params({ ...extra, "hub.topic": topic, k: "tok" }))).toMatchObject({ token: "tok" });
    }
  });

  it("denied 的 reason 截到 200 字", () => {
    const result = parseVerification(params({ "hub.mode": "denied", "hub.topic": topic, "hub.reason": "理由".repeat(500) }));
    expect(result).toMatchObject({ mode: "denied", reason: "理由".repeat(100) });
  });
});

describe("subscriptionFailure：訂閱失敗寫進頻道狀態的中文摘要（畫面會顯示，不放錯誤原文）", () => {
  it.each([
    ["逾時", new DOMException("The operation was aborted due to timeout", "TimeoutError"), "訂閱失敗：連線逾時，稍後會自動重試"],
    ["連不上 hub", new TypeError("fetch failed secret-detail"), "訂閱失敗：連不上 WebSub hub，稍後會自動重試"],
    ["hub 拒絕（400）", new HubError(400, "hub 回應 400：secret-detail"), "訂閱失敗：hub 拒絕訂閱請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址"],
    ["請求太頻繁", new HubError(429, "hub 回應 429：secret-detail"), "訂閱失敗：hub 請求太頻繁（429），稍後會自動重試"],
    ["hub 暫時故障", new HubError(503, "hub 回應 503：secret-detail"), "訂閱失敗：hub 暫時無法使用（503），稍後會自動重試"],
    ["其他種類的錯誤", Object.assign(new Error("secret-detail"), { name: "DrizzleQueryError" }), "訂閱失敗：發生錯誤（DrizzleQueryError）"],
  ])("%s", (_name, error, expected) => {
    const status = subscriptionFailure(error);

    expect(status).toBe(expected);
    expect(status).not.toContain("secret-detail");
  });
});
