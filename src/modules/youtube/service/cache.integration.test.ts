import { eq } from "drizzle-orm";
import { cacheLife, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv, stubYoutubeEnv } from "@/dev/test-env";
import { expiredTags, mocksOf, tagged } from "@/dev/test-helpers";
import { youtubeChannels, youtubeSettings, youtubeTranslations, youtubeVideos } from "../data/schema";
import { callbackToken, topicFor } from "../lib/websub";

vi.mock("../lib/subtitles/captions", { spy: true });

stubCoreEnv();
const { YOUTUBE_WEBSUB_SECRET: SECRET } = stubYoutubeEnv();

const { listCaptionTracks } = mocksOf(await import("../lib/subtitles/captions"), "listCaptionTracks");
const cached = await import("./cached");
const { isRecheckDue, recheckDueCaptions } = await import("./caption-status");
const { handleFeed, handleVerification } = await import("./channels");
const { saveSettings } = await import("./translation");

const CH = "UC" + "a".repeat(22);
const VIDEO = "dQw4w9WgXcQ";
const KO = { ok: true, tracks: [{ languageCode: "ko", automatic: false, translated: false }] };

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000);

beforeEach(async () => {
  listCaptionTracks.mockReset().mockResolvedValue(KO);
  await testDb.insert(youtubeChannels).values({ channelId: CH, title: "뉴진스", subscriptionStatus: "pending" });
});

describe("YouTube 的快取讀取：標上讀到的資料表、用 db 效期", () => {
  it("cachedChannels_youtube:channels", async () => {
    expect((await cached.cachedChannels()).map((c) => c.title)).toEqual(["뉴진스"]);
    expect(tagged()).toEqual(["youtube:channels"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecentVideos_讀了影片、頻道名稱與翻譯狀態_三個 tag 都標", async () => {
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상", publishedAt: hoursAgo(1) });
    await testDb.insert(youtubeTranslations).values({ videoId: VIDEO, status: "done", sourceKind: "manual", sourceCues: [], translated: [], batches: [] });

    const [video] = await cached.cachedRecentVideos();

    expect(video).toMatchObject({ videoId: VIDEO, channelTitle: "뉴진스", translationStatus: "done" });
    expect(tagged()).toEqual(["youtube:channels", "youtube:translations", "youtube:videos"]);
  });

  it("cachedSettingsView_只有末 4 碼：快取裡沒有金鑰原文也沒有密文", async () => {
    await saveSettings({ provider: "anthropic", keys: { anthropic: "sk-ant-secret-WXYZ" }, clear: [], models: {}, glossaryText: "" });
    const [row] = await testDb.select().from(youtubeSettings);

    const view = await cached.cachedSettingsView();

    expect(view.keys.anthropic).toBe("WXYZ");
    expect(JSON.stringify(view)).not.toContain("sk-ant-secret");
    expect(JSON.stringify(view)).not.toContain(row.anthropicKey!);
    expect(tagged()).toEqual(["youtube:settings"]);
  });

  it("cachedMissingApiKeyMessage_youtube:settings", async () => {
    expect(await cached.cachedMissingApiKeyMessage()).toContain("還沒設定 Claude 的 API Key");
    expect(tagged()).toEqual(["youtube:settings"]);
  });

  it("cachedTranslation_每支影片自己的 tag_不含翻譯鎖的 lock_id", async () => {
    const lockId = "11111111-2222-4333-8444-555555555555";
    await testDb.insert(youtubeTranslations).values({
      videoId: VIDEO,
      title: "새 영상",
      status: "running",
      sourceKind: "manual",
      sourceCues: [{ start: 0, end: 900, text: "안녕" }],
      translated: ["你好"],
      batches: [{ start: 0, end: 1 }],
      lockId,
    });

    const view = await cached.cachedTranslation(VIDEO);

    expect(view).toMatchObject({ title: "새 영상", status: "running", translated: ["你好"], sourceCues: [{ text: "안녕" }] });
    expect(view?.updatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(view)).not.toContain(lockId);
    expect(tagged()).toEqual(["youtube:translation:dQw4w9WgXcQ"]);
  });

  it("cachedTranslation_沒有紀錄回 null", async () => {
    expect(await cached.cachedTranslation(VIDEO)).toBeNull();
  });

  it("cachedVideoTitle_youtube:videos", async () => {
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상" });

    expect(await cached.cachedVideoTitle(VIDEO)).toBe("새 영상");
    expect(tagged()).toEqual(["youtube:videos"]);
  });
});

describe("影片清單的字幕重新檢查：用快取判斷要不要在背景檢查，結果要跟實際認領的一致", () => {
  it("isRecheckDue 判斷到期的影片_就是 recheckDueCaptions 會檢查的那幾支", async () => {
    const now = new Date();
    await testDb.insert(youtubeVideos).values([
      { videoId: "due-never00", channelId: CH, title: "a", publishedAt: hoursAgo(2) },
      { videoId: "due-stale00", channelId: CH, title: "b", publishedAt: hoursAgo(3), zhCaptionsCheckedAt: hoursAgo(2) },
      { videoId: "fresh-check", channelId: CH, title: "c", publishedAt: hoursAgo(3), zhCaptionsCheckedAt: hoursAgo(0.5) },
      { videoId: "too-old-000", channelId: CH, title: "d", publishedAt: hoursAgo(49) },
      { videoId: "has-zh-0000", channelId: CH, title: "e", publishedAt: hoursAgo(2), zhCaptions: "yes" },
      { videoId: "no-publish0", channelId: CH, title: "f", publishedAt: null },
    ]);

    const candidates = await cached.cachedRecheckCandidates();
    const due = candidates.filter((c) => isRecheckDue(c, now)).map((c) => c.videoId).sort();
    expect(tagged()).toEqual(["youtube:videos"]);

    await recheckDueCaptions(now);

    expect(listCaptionTracks.mock.calls.map(([id]) => id).sort()).toEqual(due);
    expect(due).toEqual(["due-never00", "due-stale00"]);
  });
});

describe("背景寫入（webhook、after()）後讓 tag 失效（expire: 0）", () => {
  const verifyParams = (mode: "subscribe" | "denied", token = callbackToken(CH, SECRET)) =>
    mode === "subscribe"
      ? ({ mode, topic: topicFor(CH), challenge: "c-123", leaseSeconds: 432000, token } as const)
      : ({ mode, topic: topicFor(CH), reason: "nope", token } as const);

  it("hub 確認訂閱_頻道狀態失效", async () => {
    expect(await handleVerification(verifyParams("subscribe"))).toBe("c-123");

    expect((await testDb.select().from(youtubeChannels))[0].subscriptionStatus).toBe("subscribed");
    expect(expiredTags()).toEqual(["youtube:channels"]);
  });

  it("hub 拒絕訂閱_頻道狀態失效", async () => {
    await handleVerification(verifyParams("denied"));

    expect(expiredTags()).toEqual(["youtube:channels"]);
  });

  it("k 不對（別人偽造的確認）_不寫入也不失效：不能被拿來一直打掉快取", async () => {
    expect(await handleVerification(verifyParams("subscribe", "forged"))).toBeNull();

    expect(expiredTags()).toEqual([]);
  });

  it("新影片推送_先失效影片清單_延後的字幕檢查與通知再失效一次", async () => {
    let deferred: (() => Promise<void>) | undefined;

    await handleFeed([{ videoId: VIDEO, channelId: CH, title: "새 영상", published: new Date(), url: "" }], { defer: (task) => (deferred = task) });

    expect(expiredTags()).toEqual(["youtube:videos"]);
    vi.mocked(revalidateTag).mockReset();

    await deferred!();

    const [video] = await testDb.select().from(youtubeVideos).where(eq(youtubeVideos.videoId, VIDEO));
    expect(video.zhCaptions).toBe("no");
    expect(expiredTags()).toEqual(["core:notifications", "youtube:videos"]);
  });

  it("hub 重送已經記錄過的影片_沒有寫入就不失效", async () => {
    const entry = { videoId: VIDEO, channelId: CH, title: "새 영상", published: new Date(), url: "" };
    await handleFeed([entry]);
    vi.mocked(revalidateTag).mockReset();

    await handleFeed([{ ...entry, title: "改過的標題" }]);

    expect(expiredTags()).toEqual([]);
  });

  it("背景重新檢查字幕_有檢查到影片就失效", async () => {
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상", publishedAt: hoursAgo(2) });

    expect(await recheckDueCaptions()).toBe(1);
    expect(expiredTags()).toEqual(["youtube:videos"]);
  });

  it("背景重新檢查字幕_沒有到期的影片_不失效", async () => {
    expect(await recheckDueCaptions()).toBe(0);
    expect(expiredTags()).toEqual([]);
  });
});
