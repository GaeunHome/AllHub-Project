import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { stubYoutubeEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { youtubeChannels, youtubeSettings, youtubeTranslations, youtubeVideos } from "../data/schema";
import { callbackToken, topicFor } from "../lib/websub";

const { YOUTUBE_WEBSUB_SECRET: SECRET } = stubYoutubeEnv();
/** hub 確認時帶回的 k（我們送出的 callback 上的那個） */
const k = (channelId: string) => callbackToken(channelId, SECRET);

vi.mock("../lib/api", { spy: true });
vi.mock("@/core/notify", { spy: true });
// 新影片會去讀觀看頁判斷有沒有中文字幕，測試不能真的連 YouTube
vi.mock("../lib/subtitles/captions", { spy: true });

const api = mocksOf(await import("../lib/api"), "resolveHandle", "fetchChannelFeed", "hubRequest");
const { HubError } = await import("../lib/api");
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { listCaptionTracks } = mocksOf(await import("../lib/subtitles/captions"), "listCaptionTracks");

const {
  addChannel,
  removeChannel,
  handleVerification,
  handleFeed,
  renewSubscriptions,
  videoTitle,
  cleanupVideos,
  listChannels,
  recentVideos,
  setChannelNotify,
  YoutubeUserError,
} = await import("./channels");

const CH = "UC" + "a".repeat(22);
const OTHER = "UC" + "b".repeat(22);
const NOW = new Date("2026-10-07T12:00:00Z");

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.resolveHandle.mockReset().mockResolvedValue({ channelId: CH, thumbnail: "https://img/1.jpg" });
  api.fetchChannelFeed.mockReset().mockResolvedValue({ title: "뉴진스", entries: [] });
  api.hubRequest.mockReset().mockResolvedValue(undefined);
  notify.mockReset().mockResolvedValue(undefined);
  listCaptionTracks.mockReset().mockResolvedValue({ ok: true, tracks: [{ languageCode: "ko", automatic: false, translated: false }] });
  return () => vi.useRealTimers();
});

const insertChannel = (values: Partial<typeof youtubeChannels.$inferInsert> = {}) =>
  getDb().insert(youtubeChannels).values({ channelId: CH, title: "뉴진스", subscriptionStatus: "subscribed", ...values });

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
    const [row] = await testDb.select().from(youtubeChannels);
    api.hubRequest.mockRejectedValue(new Error("network"));

    const result = await removeChannel(row.id);

    expect(api.hubRequest).toHaveBeenCalledWith("unsubscribe", CH);
    expect(result.warning).toBeTruthy();
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
  });

  it("hub 在退訂請求回來前就回呼確認_確認通過（資料列已先刪除），不留孤兒訂閱", async () => {
    await insertChannel();
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
    const [row] = await testDb.select().from(youtubeChannels);
    api.hubRequest.mockRejectedValue(new Error("hub 回應 500：secret-detail"));

    await removeChannel(row.id);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("Error");
  });
});

describe("handleVerification", () => {
  it("追蹤中的頻道訂閱確認_回challenge_記錄租約", async () => {
    await insertChannel({ subscriptionStatus: "pending" });
    const challenge = await handleVerification({ mode: "subscribe", topic: topicFor(CH), challenge: "c1", leaseSeconds: 432000, token: k(CH) });

    expect(challenge).toBe("c1");
    const [row] = await testDb.select().from(youtubeChannels);
    expect(row.subscriptionStatus).toBe("subscribed");
    expect(row.leaseExpiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 432000_000).toISOString());
  });

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

  it("hub 拒絕訂閱（denied）_更新狀態", async () => {
    await insertChannel({ subscriptionStatus: "pending" });
    await handleVerification({ mode: "denied", topic: topicFor(CH), reason: "bad", token: k(CH) });
    const [row] = await testDb.select().from(youtubeChannels);
    expect(row.subscriptionStatus).toBe("訂閱失敗：hub 拒絕（bad）");
  });
});

describe("handleFeed", () => {
  const entry = (videoId: string, published: Date | null, channelId = CH) => ({
    videoId,
    channelId,
    title: `影片 ${videoId}`,
    published,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
  const recent = new Date(NOW.getTime() - 10 * 60_000);

  beforeEach(async () => {
    await insertChannel();
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
    await testDb.update(youtubeChannels).set({ notifyEnabled: false });
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

  it("defer_通知延到之後執行", async () => {
    const tasks: Array<() => Promise<void>> = [];
    await handleFeed([entry("aaaaaaaaaaa", recent)], { defer: (t) => tasks.push(t) });
    expect(notify).not.toHaveBeenCalled();
    await tasks[0]();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("通知失敗不丟錯", async () => {
    notify.mockRejectedValue(new Error("db down"));
    await expect(handleFeed([entry("aaaaaaaaaaa", recent)])).resolves.toBeUndefined();
  });

  it("通知失敗的 log 只記錯誤種類，不記 message", async () => {
    const log = captureErrorLog();
    notify.mockRejectedValue(new TypeError("fetch failed: secret-detail"));

    await handleFeed([entry("aaaaaaaaaaa", recent)]);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
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
    await renewSubscriptions();
    expect(api.hubRequest).toHaveBeenCalledWith("subscribe", CH);
  });

  it("續訂途中頻道被刪除_略過它，不替已刪除的頻道訂閱", async () => {
    await getDb().insert(youtubeChannels).values([
      { channelId: "UC" + "1".repeat(22), title: "A", subscriptionStatus: "pending" },
      { channelId: "UC" + "2".repeat(22), title: "B", subscriptionStatus: "pending" },
    ]);
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
    captureErrorLog();
    api.hubRequest.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);

    await renewSubscriptions();

    const rows = await testDb.select().from(youtubeChannels).orderBy(youtubeChannels.title);
    expect(rows.map((r) => r.subscriptionStatus)).toEqual(["訂閱失敗：發生錯誤（Error）", "pending"]);
  });
});

describe("videoTitle", () => {
  it("收過推送的影片_回標題；沒看過的影片_回 null", async () => {
    await getDb().insert(youtubeVideos).values({ videoId: "abcdefghijk", channelId: CH, title: "새 영상" });

    expect(await videoTitle("abcdefghijk")).toBe("새 영상");
    expect(await videoTitle("zzzzzzzzzzz")).toBeNull();
  });
});

describe("cleanupVideos", () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000);
  const video = (videoId: string, createdDaysAgo: number, publishedDaysAgo: number) => ({
    videoId,
    channelId: CH,
    title: `影片 ${videoId}`,
    createdAt: daysAgo(createdDaysAgo),
    publishedAt: daysAgo(publishedDaysAgo),
  });

  it("只刪超過 14 天的新影片紀錄_頻道、翻譯、設定都不動", async () => {
    await insertChannel();
    await getDb().insert(youtubeVideos).values([video("oldoldoldol", 15, 15), video("edgeedgeedg", 14, 14), video("newnewnewne", 1, 1)]);
    await getDb().insert(youtubeTranslations).values({ videoId: "oldoldoldol", sourceKind: "manual", sourceCues: [], translated: [], batches: [] });
    await getDb().insert(youtubeSettings).values({ id: 1 });

    expect(await cleanupVideos(NOW)).toBe("刪除 1 筆超過 14 天的新影片紀錄");

    const left = await testDb.select({ videoId: youtubeVideos.videoId }).from(youtubeVideos);
    expect(left.map((v) => v.videoId).sort()).toEqual(["edgeedgeedg", "newnewnewne"]);
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(1);
    expect(await testDb.select().from(youtubeTranslations)).toHaveLength(1);
    expect(await testDb.select().from(youtubeSettings)).toHaveLength(1);
  });

  it("刪掉的影片_hub 再推送也不會重複通知", async () => {
    await insertChannel();
    await getDb().insert(youtubeVideos).values(video("oldoldoldol", 15, 15));
    await cleanupVideos(NOW);

    await handleFeed([{ videoId: "oldoldoldol", channelId: CH, title: "改過的標題", published: daysAgo(15), url: "https://www.youtube.com/watch?v=oldoldoldol" }]);

    expect(notify).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(0);
  });

  it("紀錄很舊但發布時間還在 14 天內_不刪_之後再推送仍能去重", async () => {
    await getDb().insert(youtubeVideos).values(video("premierepre", 20, 1));

    expect(await cleanupVideos(NOW)).toBe("刪除 0 筆超過 14 天的新影片紀錄");
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
  });
});

describe("通知開關", () => {
  it("新追蹤的頻道預設開啟通知", async () => {
    await insertChannel();

    expect((await listChannels()).map((c) => c.notifyEnabled)).toEqual([true]);
  });

  it("setChannelNotify_關掉、再打開_找不到頻道回 false", async () => {
    await insertChannel();
    const [channel] = await listChannels();

    expect(await setChannelNotify(channel.id, false)).toBe(true);
    expect((await listChannels())[0].notifyEnabled).toBe(false);
    expect(await setChannelNotify(channel.id, true)).toBe(true);
    expect((await listChannels())[0].notifyEnabled).toBe(true);
    expect(await setChannelNotify(9999, true)).toBe(false);
  });
});

describe("recentVideos", () => {
  it("帶出中文字幕狀態與檢查時間（影片清單顯示按鈕用）", async () => {
    await insertChannel();
    await getDb().insert(youtubeVideos).values([
      { videoId: "yesyesyesye", channelId: CH, title: "有字幕", publishedAt: NOW, zhCaptions: "yes", zhCaptionsCheckedAt: NOW },
      { videoId: "newnewnewne", channelId: CH, title: "還沒檢查", publishedAt: new Date(NOW.getTime() - 60_000) },
    ]);

    const videos = await recentVideos();

    expect(videos.map((v) => [v.videoId, v.zhCaptions, v.zhCaptionsCheckedAt])).toEqual([
      ["yesyesyesye", "yes", NOW],
      ["newnewnewne", "unknown", null],
    ]);
  });
});
