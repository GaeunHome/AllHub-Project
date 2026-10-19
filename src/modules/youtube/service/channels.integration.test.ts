import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { insertTestUser, insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubYoutubeEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { youtubeChannels, youtubeFollows, youtubeVideos } from "../data/schema";
import { CHANNEL_ID as CH, KOREAN_TRACKS, OTHER_CHANNEL_ID as OTHER, follow as followAs, insertChannel as insertChannelRow } from "../dev/fixtures";
import { callbackToken, topicFor } from "../lib/websub";

const { YOUTUBE_WEBSUB_SECRET: SECRET } = stubYoutubeEnv();
/** hub 確認時帶回的 k 就是我們送出的 callback 上那個 */
const k = (channelId: string) => callbackToken(channelId, SECRET);

vi.mock("../lib/api", { spy: true });
vi.mock("@/core/notify", { spy: true });
// 新影片會去讀觀看頁判斷有沒有中文字幕 測試不能真的連 YouTube
vi.mock("../lib/subtitles/captions", { spy: true });

const api = mocksOf(await import("../lib/api"), "resolveHandle", "fetchChannelFeed", "hubRequest", "checkIsShort");
const { HubError } = await import("../lib/api");
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { listCaptionTracks } = mocksOf(await import("../lib/subtitles/captions"), "listCaptionTracks");

const service = await import("./channels");
const { handleVerification, handleFeed, renewSubscriptions, renewSubscriptionsFor, videoTitle, listFollowedChannels, setChannelNotify, YoutubeUserError } = service;
const { recentVideos } = await import("./video-list");

const NOW = new Date("2026-10-07T12:00:00Z");

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

/** 沒特別說的都是 me 在操作 */
const addChannel = (input: string) => service.addChannel(me, input);
const removeChannel = (id: number) => service.removeChannel(me, id);

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.resolveHandle.mockReset().mockResolvedValue({ channelId: CH, thumbnail: "https://img/1.jpg" });
  api.fetchChannelFeed.mockReset().mockResolvedValue({ title: "뉴진스", entries: [] });
  api.hubRequest.mockReset().mockResolvedValue(undefined);
  api.checkIsShort.mockReset().mockResolvedValue(null);
  notify.mockReset().mockResolvedValue(undefined);
  listCaptionTracks.mockReset().mockResolvedValue(KOREAN_TRACKS);
  return () => vi.useRealTimers();
});

const insertChannel = (values: Partial<typeof youtubeChannels.$inferInsert> = {}) => insertChannelRow(getDb(), values);
const follow = (userId: string, channelId = CH, notifyEnabled = true) => followAs(getDb(), userId, channelId, notifyEnabled);
const followers = async () => (await getDb().select().from(youtubeFollows)).map((f) => f.userId).sort();

describe("addChannel", () => {
  it("handle_解析成頻道id_存名稱與頭像_送出訂閱_狀態pending", async () => {
    const channel = await addChannel("https://www.youtube.com/@NewJeans_official");

    expect(api.resolveHandle).toHaveBeenCalledWith("NewJeans_official");
    expect(api.hubRequest).toHaveBeenCalledWith("subscribe", CH);
    expect(channel).toMatchObject({ channelId: CH, title: "뉴진스", thumbnail: "https://img/1.jpg", subscriptionStatus: "pending" });
  });

  it("頻道id_不解析handle", async () => {
    await addChannel(CH);
    expect(api.resolveHandle).not.toHaveBeenCalled();
    expect(api.fetchChannelFeed).toHaveBeenCalledWith(CH);
  });

  it("訂閱失敗_仍保留頻道_狀態寫原因（中文摘要，不放 hub 回應的原文）", async () => {
    captureErrorLog();
    api.hubRequest.mockRejectedValue(new HubError(400, "hub 回應 400：callback 不是公開網址"));
    const channel = await addChannel(CH);
    expect(channel.subscriptionStatus).toBe("訂閱失敗：hub 拒絕訂閱請求（400），請確認 PUBLIC_BASE_URL 是公開的 HTTPS 網址");
    expect(channel.subscriptionStatus).not.toContain("callback 不是公開網址");
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(1);
  });

  it("訂閱請求逾時、hub 也沒有確認_狀態寫「連線逾時，稍後會自動重試」，不寫英文的錯誤原文；log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    api.hubRequest.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    const channel = await addChannel(CH);

    expect(channel.subscriptionStatus).toBe("訂閱失敗：連線逾時，稍後會自動重試");
    expect(loggedText(log)).toContain("TimeoutError");
    expect(loggedText(log)).not.toContain("aborted");
  });

  it("格式錯誤_或重複追蹤_回使用者錯誤", async () => {
    await expect(addChannel("https://example.com")).rejects.toBeInstanceOf(YoutubeUserError);
    await addChannel(CH);
    await expect(addChannel(CH)).rejects.toThrow(/已經在追蹤/);
  });

  it("feed 查不到頻道_回使用者錯誤且不存", async () => {
    api.fetchChannelFeed.mockResolvedValue(null);
    await expect(addChannel(CH)).rejects.toBeInstanceOf(YoutubeUserError);
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
  });

  it("hub 在訂閱請求回來前就回呼確認_狀態維持 subscribed，不被蓋回 pending", async () => {
    api.hubRequest.mockImplementation(async (_mode: string, channelId: string) => {
      await handleVerification({ mode: "subscribe", topic: topicFor(channelId), challenge: "c", leaseSeconds: 432000, token: k(channelId) });
    });

    await addChannel(CH);

    const [row] = await testDb.select().from(youtubeChannels);
    expect(row.subscriptionStatus).toBe("subscribed");
    expect(row.leaseExpiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 432000_000).toISOString());
  });

  it("訂閱請求逾時但 hub 其實已經確認_不把 subscribed 改成失敗", async () => {
    api.hubRequest.mockImplementation(async (_mode: string, channelId: string) => {
      await handleVerification({ mode: "subscribe", topic: topicFor(channelId), challenge: "c", leaseSeconds: 432000, token: k(channelId) });
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });

    await addChannel(CH);

    const [row] = await testDb.select().from(youtubeChannels);
    expect(row.subscriptionStatus).toBe("subscribed");
  });
});

describe("removeChannel", () => {
  it("取消訂閱失敗_仍刪除並回警告", async () => {
    await insertChannel();
    await follow(me);
    const [row] = await testDb.select().from(youtubeChannels);
    api.hubRequest.mockRejectedValue(new Error("network"));

    const result = await removeChannel(row.id);

    expect(api.hubRequest).toHaveBeenCalledWith("unsubscribe", CH);
    expect(result.warning).toBeTruthy();
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
  });

  it("hub 在退訂請求回來前就回呼確認_確認通過（資料列已先刪除），不留孤兒訂閱", async () => {
    await insertChannel();
    await follow(me);
    const [row] = await testDb.select().from(youtubeChannels);
    const confirmations: (string | null)[] = [];
    api.hubRequest.mockImplementation(async (_mode: string, channelId: string) => {
      confirmations.push(await handleVerification({ mode: "unsubscribe", topic: topicFor(channelId), challenge: "u1", token: k(channelId) }));
    });

    expect(await removeChannel(row.id)).toEqual({});

    expect(confirmations).toEqual(["u1"]);
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
  });

  it("取消訂閱失敗的 log 只記錯誤種類，不記 message", async () => {
    const log = captureErrorLog();
    await insertChannel();
    await follow(me);
    const [row] = await testDb.select().from(youtubeChannels);
    api.hubRequest.mockRejectedValue(new Error("hub 回應 500：secret-detail"));

    await removeChannel(row.id);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("Error");
  });
});

describe("handleVerification", () => {
  it("沒追蹤的頻道訂閱確認_拒絕", async () => {
    expect(await handleVerification({ mode: "subscribe", topic: topicFor(OTHER), challenge: "c", leaseSeconds: 1, token: k(OTHER) })).toBeNull();
  });

  it("取消訂閱_只接受已刪除的頻道（避免別人替我們退訂）", async () => {
    await insertChannel();
    expect(await handleVerification({ mode: "unsubscribe", topic: topicFor(CH), challenge: "c", token: k(CH) })).toBeNull();
    expect(await handleVerification({ mode: "unsubscribe", topic: topicFor(OTHER), challenge: "c2", token: k(OTHER) })).toBe("c2");
  });

  it("非 YouTube topic_拒絕", async () => {
    expect(await handleVerification({ mode: "subscribe", topic: "https://evil.example/feed", challenge: "c" })).toBeNull();
  });
});

describe("handleFeed", () => {
  const entry = (videoId: string, published: Date | null, channelId = CH) => ({
    videoId,
    channelId,
    title: `影片 ${videoId}`,
    published,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    isShort: false,
  });
  const recent = new Date(NOW.getTime() - 10 * 60_000);

  beforeEach(async () => {
    await insertChannel();
    await follow(me);
  });

  it("追蹤中頻道的新影片_存起來並通知一次_記錄通知時間", async () => {
    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toMatchObject({ module: "youtube", kind: "new_video", title: "뉴진스 發布了新影片" });
    expect(notify.mock.calls[0][0].body.split("\n")[0]).toBe("影片 aaaaaaaaaaa");
    const [video] = await testDb.select().from(youtubeVideos);
    expect(video).toMatchObject({ videoId: "aaaaaaaaaaa", channelId: CH });
    expect(video.notifiedAt).not.toBeNull();
  });

  it("已經有人工中文字幕_通知說可以直接看、連到 YouTube_記下檢查結果", async () => {
    listCaptionTracks.mockResolvedValue({ ok: true, tracks: [{ languageCode: "zh-TW", automatic: false, translated: false }] });

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(listCaptionTracks).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(notify).toHaveBeenCalledWith({
      recipients: [me],
      module: "youtube",
      kind: "new_video",
      title: "뉴진스 發布了新影片",
      body: "影片 aaaaaaaaaaa\n有中文字幕，可以直接看",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    });
    const [video] = await testDb.select().from(youtubeVideos);
    expect(video.zhCaptions).toBe("yes");
    expect(video.zhCaptionsCheckedAt).toEqual(NOW);
  });

  it("沒有中文字幕（只有自動產生或自動翻譯的也算沒有）_通知用翻譯觀看、連到自己網站的觀看頁", async () => {
    listCaptionTracks.mockResolvedValue({
      ok: true,
      tracks: [
        { languageCode: "ko", automatic: false, translated: false },
        { languageCode: "zh", automatic: true, translated: false },
      ],
    });

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify.mock.calls[0][0]).toMatchObject({ body: "影片 aaaaaaaaaaa\n沒有中文字幕，用翻譯觀看", url: "/youtube/watch/aaaaaaaaaaa" });
    expect((await testDb.select().from(youtubeVideos))[0].zhCaptions).toBe("no");
  });

  it("抓不到字幕資訊（雲端常被 YouTube 擋）_通知說無法確認、附 YouTube 連結", async () => {
    listCaptionTracks.mockResolvedValue({ ok: false, reason: "blocked", message: "YouTube 要求驗證" });

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify.mock.calls[0][0]).toMatchObject({ body: "影片 aaaaaaaaaaa\n無法確認是否有中文字幕", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });
    const [video] = await testDb.select().from(youtubeVideos);
    expect(video.zhCaptions).toBe("unknown");
    expect(video.zhCaptionsCheckedAt).toEqual(NOW);
  });

  it("檢查字幕時出錯_照樣通知（當作無法確認）", async () => {
    captureErrorLog();
    listCaptionTracks.mockRejectedValue(new Error("boom"));

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify.mock.calls[0][0]).toMatchObject({ body: "影片 aaaaaaaaaaa\n無法確認是否有中文字幕" });
  });

  it("檢查字幕與通知都延到回應之後（defer）_推送本身只寫紀錄", async () => {
    const tasks: Array<() => Promise<void>> = [];

    await handleFeed([entry("aaaaaaaaaaa", recent)], { defer: (t) => tasks.push(t) });

    expect(listCaptionTracks).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
    await tasks[0]();
    expect(listCaptionTracks).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("頻道關掉通知_照樣記錄新影片與字幕狀態_但不建立通知", async () => {
    await testDb.update(youtubeFollows).set({ notifyEnabled: false });
    listCaptionTracks.mockResolvedValue({ ok: true, tracks: [{ languageCode: "zh-Hant", automatic: false, translated: false }] });

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify).not.toHaveBeenCalled();
    const [video] = await testDb.select().from(youtubeVideos);
    expect(video).toMatchObject({ videoId: "aaaaaaaaaaa", zhCaptions: "yes", notifiedAt: null });
  });

  it("同一支影片再推送（改標題）_不重複通知", async () => {
    await handleFeed([entry("aaaaaaaaaaa", recent)]);
    await handleFeed([{ ...entry("aaaaaaaaaaa", recent), title: "改過的標題" }]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("超過 24 小時的舊影片、沒有發布時間、或未追蹤頻道_不存也不通知", async () => {
    await handleFeed([
      entry("bbbbbbbbbbb", new Date(NOW.getTime() - 25 * 3600_000)),
      entry("ccccccccccc", null),
      entry("ddddddddddd", recent, OTHER),
    ]);
    expect(notify).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(0);
  });

  it("RSS 連結就是 /shorts/ 的影片_不存、不檢查、不通知", async () => {
    await handleFeed([{ ...entry("shortshort1", recent), isShort: true, url: "https://www.youtube.com/shorts/shortshort1" }, entry("aaaaaaaaaaa", recent)]);

    expect((await testDb.select().from(youtubeVideos)).map((v) => v.videoId)).toEqual(["aaaaaaaaaaa"]);
    expect(api.checkIsShort).not.toHaveBeenCalledWith("shortshort1");
    expect(listCaptionTracks).not.toHaveBeenCalledWith("shortshort1");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("連結看不出來、但請求 /shorts/ 確認是 Shorts_刪掉這支影片，不檢查字幕、不通知；log 記一行（只有種類與影片 id）", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    onTestFinished(() => info.mockRestore());
    api.checkIsShort.mockResolvedValue(true);
    const tasks: Array<() => Promise<void>> = [];

    await handleFeed([entry("aaaaaaaaaaa", recent)], { defer: (t) => tasks.push(t) });
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
    await tasks[0]();

    expect(api.checkIsShort).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(0);
    expect(listCaptionTracks).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[youtube] 確認是 Shorts，刪除推送的影片", "aaaaaaaaaaa");
  });

  it.each([
    ["確認是一般影片", false],
    ["無法判斷（被擋、同意頁）", null],
  ])("%s_當作一般影片照常檢查字幕與通知", async (_name, result) => {
    api.checkIsShort.mockResolvedValue(result);

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(api.checkIsShort).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(listCaptionTracks).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(notify).toHaveBeenCalledOnce();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
  });

  it.each([
    ["連不上 YouTube", () => new TypeError("fetch failed: secret-detail"), "TypeError"],
    ["逾時", () => new DOMException("The operation was aborted due to timeout: secret-detail", "TimeoutError"), "TimeoutError"],
  ])("確認是不是 Shorts 時%s（lib 照常丟出）_當作一般影片照常檢查字幕與通知；log 只記錯誤種類", async (_name, failure, kind) => {
    const log = captureErrorLog();
    // 用真的 checkIsShort 打到會失敗的 fetch 錯誤要一路傳到 service 才記得到 log
    const { checkIsShort } = await vi.importActual<typeof import("../lib/api")>("../lib/api");
    api.checkIsShort.mockImplementation(checkIsShort);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(failure())));

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(listCaptionTracks).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(notify).toHaveBeenCalledOnce();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
    expect(loggedText(log)).toContain("確認是不是 Shorts 失敗");
    expect(loggedText(log)).toContain(kind);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("通知失敗的 log 只記錯誤種類，不記 message", async () => {
    const log = captureErrorLog();
    notify.mockRejectedValue(new TypeError("fetch failed: secret-detail"));

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
  });

  it("新影片通知只送給追蹤、而且通知開著的人", async () => {
    const muted = await insertTestUser(getDb(), "carol");
    await follow(other);
    await follow(muted, CH, false);

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(notify).toHaveBeenCalledOnce();
    expect([...notify.mock.calls[0][0].recipients].sort()).toEqual([me, other].sort());
  });

  it("沒有人追蹤的頻道（例如最後一位追蹤者刪除了帳號）_照樣記錄影片，但不通知任何人", async () => {
    await getDb().delete(youtubeFollows);

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("renewSubscriptions", () => {
  it("租約剩不到 2 天、沒有租約、或失敗的頻道重新訂閱；健康的略過", async () => {
    const day = 24 * 3600_000;
    await getDb().insert(youtubeChannels).values([
      { channelId: "UC" + "1".repeat(22), title: "快到期", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(NOW.getTime() + day) },
      { channelId: "UC" + "2".repeat(22), title: "健康", subscriptionStatus: "subscribed", leaseExpiresAt: new Date(NOW.getTime() + 4 * day) },
      { channelId: "UC" + "3".repeat(22), title: "失敗", subscriptionStatus: "訂閱失敗：x", leaseExpiresAt: null },
      { channelId: "UC" + "4".repeat(22), title: "沒租約", subscriptionStatus: "pending", leaseExpiresAt: null },
    ]);
    for (const n of "1234") await follow(me, "UC" + n.repeat(22));

    const summary = await renewSubscriptions();

    const renewed = api.hubRequest.mock.calls.map((c) => c[1]);
    expect(renewed.sort()).toEqual(["UC" + "1".repeat(22), "UC" + "3".repeat(22), "UC" + "4".repeat(22)]);
    expect(summary).toContain("3");
  });

  it("hub 拒絕過的頻道_租約還很長也重新訂閱", async () => {
    await getDb().insert(youtubeChannels).values({
      channelId: CH,
      title: "被拒",
      subscriptionStatus: "訂閱失敗：hub 拒絕",
      leaseExpiresAt: new Date(NOW.getTime() + 4 * 24 * 3600_000),
    });
    await follow(me);
    await renewSubscriptions();
    expect(api.hubRequest).toHaveBeenCalledWith("subscribe", CH);
  });

  it("續訂途中頻道被刪除_略過它，不替已刪除的頻道訂閱", async () => {
    await getDb().insert(youtubeChannels).values([
      { channelId: "UC" + "1".repeat(22), title: "A", subscriptionStatus: "pending" },
      { channelId: "UC" + "2".repeat(22), title: "B", subscriptionStatus: "pending" },
    ]);
    for (const n of "12") await follow(me, "UC" + n.repeat(22));
    api.hubRequest.mockImplementation(async () => {
      await getDb().delete(youtubeChannels).where(eq(youtubeChannels.title, "B"));
    });

    const summary = await renewSubscriptions();

    expect(api.hubRequest.mock.calls.map((c) => c[1])).toEqual(["UC" + "1".repeat(22)]);
    expect(summary).toContain("2 個頻道");
  });

  it("單一頻道續訂失敗_其他照常_狀態寫原因", async () => {
    await getDb().insert(youtubeChannels).values([
      { channelId: "UC" + "1".repeat(22), title: "A", subscriptionStatus: "pending" },
      { channelId: "UC" + "2".repeat(22), title: "B", subscriptionStatus: "pending" },
    ]);
    for (const n of "12") await follow(me, "UC" + n.repeat(22));
    captureErrorLog();
    api.hubRequest.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);

    await renewSubscriptions();

    const rows = await testDb.select().from(youtubeChannels).orderBy(youtubeChannels.title);
    expect(rows.map((r) => r.subscriptionStatus)).toEqual(["訂閱失敗：發生錯誤（Error）", "pending"]);
  });

  it("沒有人追蹤的頻道（例如最後一位追蹤者刪除了帳號）_不再續訂，取消訂閱並刪除", async () => {
    await insertChannel({ subscriptionStatus: "subscribed", leaseExpiresAt: new Date(NOW.getTime() + 24 * 3600_000) });

    const summary = await renewSubscriptions();

    expect(api.hubRequest.mock.calls).toEqual([["unsubscribe", CH]]);
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
    expect(summary).toContain("刪除 1 個沒有人追蹤的頻道");
  });
});

describe("renewSubscriptionsFor：使用者按「續訂」", () => {
  const later = (ms: number) => new Date(NOW.getTime() + ms);

  beforeEach(async () => {
    await getDb().insert(youtubeChannels).values([
      { channelId: CH, title: "뉴진스", subscriptionStatus: "pending" },
      { channelId: OTHER, title: "別的頻道", subscriptionStatus: "pending" },
      { channelId: "UC" + "c".repeat(22), title: "第三個", subscriptionStatus: "pending" },
    ]);
    await follow(me);
    await follow(other, OTHER);
    await follow(other, "UC" + "c".repeat(22));
  });

  it("照樣續訂全站共用的訂閱，但回應只說自己追蹤的頻道數，不透露全站的頻道數", async () => {
    const message = await renewSubscriptionsFor(me, NOW);

    expect(message).toBe("已檢查你追蹤的 1 個頻道的訂閱");
    expect(api.hubRequest).toHaveBeenCalledTimes(3);
  });

  it("自己追蹤的頻道續訂失敗_說幾個失敗、去哪裡看原因", async () => {
    captureErrorLog();
    api.hubRequest.mockImplementation(async (_mode: string, channelId: string) => {
      if (channelId === CH) throw new Error("boom");
    });

    expect(await renewSubscriptionsFor(me, NOW)).toBe("已檢查你追蹤的 1 個頻道的訂閱，1 個失敗（打開頻道的選單可以看原因）");
  });

  it("同一個人 60 秒內再按_擋下並說還要等幾秒，不呼叫 hub；別人照樣可以按；60 秒後可以再按", async () => {
    await renewSubscriptionsFor(me, NOW);
    api.hubRequest.mockClear();

    await expect(renewSubscriptionsFor(me, later(30_000))).rejects.toThrow(new YoutubeUserError("剛剛才續訂過，請 30 秒後再試"));
    expect(api.hubRequest).not.toHaveBeenCalled();

    await expect(renewSubscriptionsFor(other, later(30_000))).resolves.toContain("你追蹤的 2 個頻道");
    await expect(renewSubscriptionsFor(me, later(60_000))).resolves.toContain("你追蹤的 1 個頻道");
  });
});

describe("videoTitle", () => {
  it("收過推送的影片_回標題；沒看過的影片_回 null", async () => {
    await getDb().insert(youtubeVideos).values({ videoId: "abcdefghijk", channelId: CH, title: "새 영상" });

    expect(await videoTitle("abcdefghijk")).toBe("새 영상");
    expect(await videoTitle("zzzzzzzzzzz")).toBeNull();
  });
});

describe("通知開關", () => {
  it("setChannelNotify_關掉、再打開（記在自己的追蹤上）_找不到頻道回 false", async () => {
    await insertChannel();
    await follow(me);
    const [channel] = await listFollowedChannels(me);

    expect(await setChannelNotify(me, channel.id, false)).toBe(true);
    expect((await listFollowedChannels(me))[0].notifyEnabled).toBe(false);
    expect(await setChannelNotify(me, channel.id, true)).toBe(true);
    expect((await listFollowedChannels(me))[0].notifyEnabled).toBe(true);
    expect(await setChannelNotify(me, 9999, true)).toBe(false);
  });

  it("用自己沒追蹤的頻道 id 改通知開關_回 false，不影響追蹤它的人", async () => {
    await insertChannel();
    await follow(other);
    const [channel] = await listFollowedChannels(other);

    expect(await setChannelNotify(me, channel.id, false)).toBe(false);
    expect((await listFollowedChannels(other))[0].notifyEnabled).toBe(true);
  });
});

describe("recentVideos", () => {
  it("帶出中文字幕狀態與檢查時間（影片清單顯示按鈕用）", async () => {
    await insertChannel();
    await follow(me);
    await getDb().insert(youtubeVideos).values([
      { videoId: "yesyesyesye", channelId: CH, title: "有字幕", publishedAt: NOW, zhCaptions: "yes", zhCaptionsCheckedAt: NOW },
      { videoId: "newnewnewne", channelId: CH, title: "還沒檢查", publishedAt: new Date(NOW.getTime() - 60_000) },
    ]);

    const videos = await recentVideos(me);

    expect(videos.map((v) => [v.videoId, v.zhCaptions, v.zhCaptionsCheckedAt])).toEqual([
      ["yesyesyesye", "yes", NOW],
      ["newnewnewne", "unknown", null],
    ]);
  });

  it("帶出頻道 id 與追蹤時存下的頭像（卡片上的頻道頭像用）；沒追蹤的頻道（包括已刪除的）的影片不列出", async () => {
    await insertChannel({ thumbnail: "https://yt3.ggpht.com/a.jpg" });
    await follow(me);
    await getDb().insert(youtubeVideos).values([
      { videoId: "trackedtrac", channelId: CH, title: "追蹤中", publishedAt: NOW },
      { videoId: "orphanorpha", channelId: OTHER, title: "頻道已刪除", publishedAt: new Date(NOW.getTime() - 60_000) },
    ]);

    const videos = await recentVideos(me);

    expect(videos.map((v) => [v.videoId, v.channelId, v.channelTitle, v.channelThumbnail])).toEqual([["trackedtrac", CH, "뉴진스", "https://yt3.ggpht.com/a.jpg"]]);
  });

  it("每個人只看自己追蹤頻道的最新 20 支，最新的在前", async () => {
    await insertChannel();
    await insertChannel({ channelId: OTHER, title: "別的頻道" });
    await follow(me);
    await follow(other, OTHER);
    await getDb()
      .insert(youtubeVideos)
      .values([
        ...Array.from({ length: 25 }, (_, i) => ({ videoId: `mine${String(i).padStart(7, "0")}`, channelId: CH, title: `第 ${i} 支`, publishedAt: new Date(NOW.getTime() - i * 60_000) })),
        { videoId: "theirs00001", channelId: OTHER, title: "別人的", publishedAt: NOW },
      ]);

    const mine = await recentVideos(me);

    expect(mine).toHaveLength(20);
    expect(mine[0].videoId).toBe("mine0000000");
    expect(mine.at(-1)!.videoId).toBe("mine0000019");
    expect((await recentVideos(other)).map((v) => v.videoId)).toEqual(["theirs00001"]);
  });
});

describe("追蹤每人一份，頻道與 WebSub 訂閱共用", () => {
  const entry = (videoId: string, published: Date, channelId = CH, isShort = false) => ({ videoId, channelId, title: `影片 ${videoId}`, published, url: "", isShort });
  const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600_000);
  const videoIds = async () => (await testDb.select().from(youtubeVideos)).map((v) => v.videoId).sort();

  it("追蹤記在追蹤的人名下", async () => {
    await addChannel(CH);

    expect(await followers()).toEqual([me]);
  });

  it("已經有人追蹤的頻道_只加自己的追蹤，不重新訂閱", async () => {
    await insertChannel();
    await follow(other);

    await addChannel(CH);

    expect(api.hubRequest).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(1);
    expect(await followers()).toEqual([me, other].sort());
  });

  it("已經有人追蹤、但訂閱是失敗的頻道_新的追蹤者加入時再試一次（跟 Twitch 一樣，不必等排程）", async () => {
    await insertChannel({ subscriptionStatus: "訂閱失敗：連線逾時，稍後會自動重試" });
    await follow(other);

    expect(await addChannel(CH)).toMatchObject({ subscriptionStatus: "pending" });

    expect(api.hubRequest).toHaveBeenCalledWith("subscribe", CH);
    expect(await followers()).toEqual([me, other].sort());
  });

  it("已經有人追蹤、訂閱正在等 hub 確認的頻道_不重複送出", async () => {
    await insertChannel({ subscriptionStatus: "pending" });
    await follow(other);

    await addChannel(CH);

    expect(api.hubRequest).not.toHaveBeenCalled();
  });

  it("第一次追蹤的頻道_從 RSS feed 補進最近的影片（不發通知），馬上看得到", async () => {
    api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [entry("fresh000001", hoursAgo(2)), entry("older000001", hoursAgo(72)), entry("foreign0001", hoursAgo(5), OTHER)] });

    await addChannel(CH);

    expect(await videoIds()).toEqual(["fresh000001", "older000001"]);
    expect(notify).not.toHaveBeenCalled();
    expect((await recentVideos(me)).map((v) => v.videoId)).toEqual(["fresh000001", "older000001"]);
  });

  it("追蹤時補影片_略過 RSS 裡的 Shorts", async () => {
    api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [entry("fresh000001", hoursAgo(2)), entry("shortshort1", hoursAgo(3), CH, true), entry("shortshort2", hoursAgo(72), CH, true)] });

    await addChannel(CH);

    expect(await videoIds()).toEqual(["fresh000001"]);
  });

  it("已經有人追蹤的頻道_只補發布超過 24 小時的影片（24 小時內的交給 WebSub 推送，照常通知所有追蹤者）", async () => {
    await insertChannel();
    await follow(other);
    api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [entry("fresh000001", hoursAgo(2)), entry("older000001", hoursAgo(72))] });

    await addChannel(CH);

    expect(await videoIds()).toEqual(["older000001"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("還有別人追蹤_取消追蹤只刪自己的追蹤，頻道與訂閱都留著", async () => {
    await insertChannel();
    await follow(me);
    await follow(other);
    const [row] = await testDb.select().from(youtubeChannels);

    expect(await removeChannel(row.id)).toEqual({});

    expect(api.hubRequest).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(1);
    expect(await followers()).toEqual([other]);
  });

  it("用自己沒追蹤的頻道 id 取消追蹤_沒有效果", async () => {
    await insertChannel();
    await follow(other);
    const [row] = await testDb.select().from(youtubeChannels);

    expect(await removeChannel(row.id)).toEqual({});

    expect(api.hubRequest).not.toHaveBeenCalled();
    expect(await followers()).toEqual([other]);
  });

  it("追蹤清單只列自己追蹤的頻道", async () => {
    await insertChannel();
    await insertChannel({ channelId: OTHER, title: "別的頻道" });
    await follow(me);
    await follow(other, OTHER);

    expect((await listFollowedChannels(me)).map((c) => c.channelId)).toEqual([CH]);
    expect((await listFollowedChannels(other)).map((c) => c.channelId)).toEqual([OTHER]);
  });
});
