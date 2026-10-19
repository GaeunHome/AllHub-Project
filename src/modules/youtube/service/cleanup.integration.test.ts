import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { insertTestUser, insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubYoutubeEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { youtubeChannels, youtubeFollows, youtubeSettings, youtubeTranslations, youtubeVideos } from "../data/schema";
import { CHANNEL_ID as CH, KOREAN_TRACKS, OTHER_CHANNEL_ID as OTHER, follow as followAs, insertChannel as insertChannelRow } from "../dev/fixtures";

stubYoutubeEnv();

vi.mock("../lib/api", { spy: true });
vi.mock("@/core/notify", { spy: true });
// 清理後再推送的影片會去讀觀看頁判斷有沒有中文字幕 測試不能真的連 YouTube
vi.mock("../lib/subtitles/captions", { spy: true });

const api = mocksOf(await import("../lib/api"), "fetchChannelFeed", "hubRequest", "checkIsShort");
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { listCaptionTracks } = mocksOf(await import("../lib/subtitles/captions"), "listCaptionTracks");

const channels = await import("./channels");
const { handleFeed, renewSubscriptions } = channels;
const { cleanupVideos } = await import("./cleanup");
const { recentVideos } = await import("./video-list");

const NOW = new Date("2026-10-07T12:00:00Z");

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

/** 沒特別說的都是 me 在操作 */
const removeChannel = (id: number) => channels.removeChannel(me, id);
const insertChannel = (values: Partial<typeof youtubeChannels.$inferInsert> = {}) => insertChannelRow(getDb(), values);
const follow = (userId: string, channelId = CH, notifyEnabled = true) => followAs(getDb(), userId, channelId, notifyEnabled);

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.fetchChannelFeed.mockReset().mockResolvedValue({ title: "뉴진스", entries: [] });
  api.hubRequest.mockReset().mockResolvedValue(undefined);
  api.checkIsShort.mockReset().mockResolvedValue(null);
  notify.mockReset().mockResolvedValue(undefined);
  listCaptionTracks.mockReset().mockResolvedValue(KOREAN_TRACKS);
  return () => vi.useRealTimers();
});

/** setupTestDb 底下的 PGlite TestDb 的型別沒有列出 drizzle 的 $client */
const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;
/**
 * 正式環境的 postgres-js 不轉 Date 參數 跟欄位比較時 drizzle 才會轉
 * 測試用的 PGlite 會自己轉而查不出來 所以直接看送出的參數
 */
const dateParams = (query: MockInstance) => query.mock.calls.flatMap(([, params]) => (Array.isArray(params) ? params : [])).filter((param) => param instanceof Date);

describe("cleanupVideos：每人只看最新 20 支，不在任何人最新 20 支裡的影片刪掉；翻譯永久保留", () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000);
  const video = (videoId: string, createdDaysAgo: number, publishedDaysAgo: number, channelId = CH) => ({
    videoId,
    channelId,
    title: `影片 ${videoId}`,
    createdAt: daysAgo(createdDaysAgo),
    publishedAt: daysAgo(publishedDaysAgo),
  });
  /** 22 支發布 3 到 24 天前的影片 最新 20 支是 old03 到 old22 */
  const olderVideos = (channelId = CH) => Array.from({ length: 22 }, (_, i) => video(`old${String(i + 3).padStart(2, "0")}${channelId.slice(-6)}`, i + 3, i + 3, channelId));
  const leftIds = async () => (await testDb.select({ videoId: youtubeVideos.videoId }).from(youtubeVideos)).map((v) => v.videoId).sort();
  const translationOf = (videoId: string) => ({ videoId, sourceKind: "upload" as const, sourceCues: [], translated: [], batches: [] });

  // 清理時會逐支確認 RSS 認不出來但還在清單上的影片
  // 沒特別說的都當成 YouTube 回答一般影片
  beforeEach(() => {
    api.checkIsShort.mockResolvedValue(false);
  });

  it("超出最新 20 支、發布超過 48 小時的影片刪掉；那支影片的翻譯保留（花錢翻好的字幕永久保留）；頻道、設定都不動", async () => {
    await insertChannel();
    await follow(me);
    await getDb().insert(youtubeVideos).values(olderVideos());
    const [oldest] = olderVideos().slice(-1);
    await getDb().insert(youtubeTranslations).values([translationOf(oldest.videoId), translationOf("old03aaaaaa"), translationOf("pastedvideo")]);
    await getDb().insert(youtubeSettings).values({ id: 1, userId: me });

    expect(await cleanupVideos(NOW)).toBe("刪除 2 支不在任何人最新 20 支裡的影片");

    expect(await leftIds()).toEqual(olderVideos().slice(0, 20).map((v) => v.videoId).sort());
    expect((await testDb.select().from(youtubeTranslations)).map((t) => t.videoId).sort()).toEqual([oldest.videoId, "old03aaaaaa", "pastedvideo"].sort());
    expect(await testDb.select().from(youtubeChannels)).toHaveLength(1);
    expect(await testDb.select().from(youtubeSettings)).toHaveLength(1);
  });

  it("頻道沒有人追蹤而被刪掉（最後一位取消追蹤、續訂排程清掉）_翻譯保留；之後影片被清掉，翻譯仍在", async () => {
    await insertChannel();
    await insertChannel({ channelId: OTHER, title: "別的頻道" });
    await follow(me);
    await follow(other, OTHER);
    await getDb().insert(youtubeVideos).values([video("mineoldvide", 5, 5), video("theirsoldvd", 5, 5, OTHER)]);
    await getDb().insert(youtubeTranslations).values([translationOf("mineoldvide"), translationOf("theirsoldvd")]);
    const [mine] = await testDb.select().from(youtubeChannels).where(eq(youtubeChannels.channelId, CH));

    await removeChannel(mine.id);
    await getDb().delete(youtubeFollows).where(eq(youtubeFollows.channelId, OTHER));
    await renewSubscriptions();
    await cleanupVideos(NOW);

    expect(await testDb.select().from(youtubeChannels)).toHaveLength(0);
    expect(await leftIds()).toEqual([]);
    expect((await testDb.select().from(youtubeTranslations)).map((t) => t.videoId).sort()).toEqual(["mineoldvide", "theirsoldvd"]);
  });

  it("只要在任何一個人的最新 20 支裡就留著", async () => {
    await insertChannel();
    await insertChannel({ channelId: OTHER, title: "別的頻道" });
    await follow(me);
    await follow(other, OTHER);
    await getDb().insert(youtubeVideos).values([...olderVideos(), video("theirsoldvd", 30, 30, OTHER)]);

    await cleanupVideos(NOW);

    expect(await leftIds()).toContain("theirsoldvd");
    expect(await leftIds()).toHaveLength(21);
  });

  it("沒有人追蹤的頻道的影片_發布超過 48 小時就刪", async () => {
    await insertChannel();
    await getDb().insert(youtubeVideos).values([video("orphanoldvd", 3, 3), video("orphannewvd", 1, 1)]);

    expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片");
    expect(await leftIds()).toEqual(["orphannewvd"]);
  });

  it("刪掉的影片_hub 再推送也不會重複通知", async () => {
    await insertChannel();
    await follow(me);
    await getDb().insert(youtubeVideos).values(video("oldoldoldol", 15, 15));
    await getDb().delete(youtubeFollows);
    await cleanupVideos(NOW);
    await follow(me);

    await handleFeed([{ videoId: "oldoldoldol", channelId: CH, title: "改過的標題", published: daysAgo(15), url: "https://www.youtube.com/watch?v=oldoldoldol", isShort: false }]);

    expect(notify).not.toHaveBeenCalled();
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(0);
  });

  describe("已經存進來的 Shorts：每個有人追蹤的頻道抓一次 RSS，把標成 Shorts 的影片刪掉", () => {
    const feedEntry = (videoId: string, isShort: boolean, channelId = CH) => ({ videoId, channelId, title: videoId, published: daysAgo(1), url: "", isShort });

    it("刪掉 RSS 標成 Shorts 的影片（翻譯保留）；一般影片留著；摘要說刪了幾支 Shorts", async () => {
      await insertChannel();
      await follow(me);
      await getDb().insert(youtubeVideos).values([video("shortshort1", 1, 1), video("shortshort2", 5, 5), video("normalvideo", 1, 1)]);
      await getDb().insert(youtubeTranslations).values(translationOf("shortshort1"));
      api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [feedEntry("shortshort1", true), feedEntry("shortshort2", true), feedEntry("normalvideo", false), feedEntry("notstored01", true)] });

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 2 支 Shorts");

      // RSS 只是用來找 Shorts 每個頻道最多等 5 秒 不照一般的 15 秒
      expect(api.fetchChannelFeed).toHaveBeenCalledWith(CH, { timeoutMs: 5_000 });
      expect(await leftIds()).toEqual(["normalvideo"]);
      expect((await testDb.select().from(youtubeTranslations)).map((t) => t.videoId)).toEqual(["shortshort1"]);
    });

    it("先刪 Shorts 再算最新 20 支：一般影片不會被 Shorts 擠出最新 20 支而刪掉", async () => {
      await insertChannel();
      await follow(me);
      const videos = olderVideos();
      await getDb().insert(youtubeVideos).values(videos);
      const [newest, second] = videos;
      api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [feedEntry(newest.videoId, true), feedEntry(second.videoId, true)] });

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 2 支 Shorts");

      expect(await leftIds()).toEqual(videos.slice(2).map((v) => v.videoId).sort());
    });

    it("只抓有人追蹤的頻道；抓不到的頻道（連線失敗、查無頻道）略過，log 只記錯誤種類，其他照常", async () => {
      const log = captureErrorLog();
      const GONE = "UC" + "c".repeat(22);
      const UNFOLLOWED = "UC" + "d".repeat(22);
      await insertChannel();
      await insertChannel({ channelId: OTHER, title: "別的頻道" });
      await insertChannel({ channelId: GONE, title: "YouTube 上已刪除" });
      await insertChannel({ channelId: UNFOLLOWED, title: "沒人追蹤" });
      await follow(me);
      await follow(other, OTHER);
      await follow(other, GONE);
      await getDb().insert(youtubeVideos).values([video("shortaaaaa1", 1, 1), video("shortbbbbb1", 1, 1, OTHER), video("shortccccc1", 1, 1, GONE)]);
      api.fetchChannelFeed.mockImplementation(async (channelId: string) => {
        if (channelId === CH) throw new TypeError("fetch failed: secret-detail");
        if (channelId === GONE) return null;
        return { title: null, entries: [feedEntry("shortbbbbb1", true, OTHER)] };
      });

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");

      expect(api.fetchChannelFeed.mock.calls.map(([id]) => id).sort()).toEqual([CH, OTHER, GONE].sort());
      expect(await leftIds()).toEqual(["shortaaaaa1", "shortccccc1"]);
      expect(loggedText(log)).toContain("TypeError");
      expect(loggedText(log)).not.toContain("secret-detail");
    });

    it("只刪這個頻道自己的影片：feed 裡混進別的頻道的 entry 不算", async () => {
      await insertChannel();
      await insertChannel({ channelId: OTHER, title: "別的頻道" });
      await follow(me);
      await follow(other, OTHER);
      await getDb().insert(youtubeVideos).values(video("theirshort1", 1, 1, OTHER));
      api.fetchChannelFeed.mockImplementation(async (channelId: string) => ({ title: null, entries: channelId === CH ? [feedEntry("theirshort1", true, OTHER)] : [] }));

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片");

      expect(await leftIds()).toEqual(["theirshort1"]);
    });

    it("推送時當成一般影片、已經通知過的 Shorts_發布 48 小時內先留著（hub 重送時找得到、不會重複通知），之後的排程再刪；沒通知過的（追蹤時補進來的）立即刪", async () => {
      await insertChannel();
      await follow(me);
      await getDb()
        .insert(youtubeVideos)
        .values([{ ...video("notified20h", 20 / 24, 20 / 24), notifiedAt: daysAgo(20 / 24) }, { ...video("notified-3d", 3, 3), notifiedAt: daysAgo(3) }, video("backfill-1d", 1, 1)]);
      api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: ["notified20h", "notified-3d", "backfill-1d"].map((id) => feedEntry(id, true)) });

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 2 支 Shorts");
      expect(await leftIds()).toEqual(["notified20h"]);

      // hub 在 24 小時內改標題重送 又確認不了是不是 Shorts
      // 找得到原本那一列 不會再通知一次
      await handleFeed([{ videoId: "notified20h", channelId: CH, title: "改過的標題", published: daysAgo(20 / 24), url: "https://www.youtube.com/watch?v=notified20h", isShort: false }]);
      expect(notify).not.toHaveBeenCalled();

      expect(await cleanupVideos(new Date(NOW.getTime() + 2 * 24 * 3600_000))).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");
      expect(await leftIds()).toEqual([]);
    });

    it.each([
      ["RSS 標成 Shorts", true],
      ["RSS 讀不到、逐支確認是 Shorts", false],
    ])("先留著的 Shorts（已經通知過、發布不到 48 小時；%s）不算進最新 20 支：一般影片不會被它擠出而刪掉，兩天後 Shorts 刪掉時清單照樣有 20 支", async (_name, inRss) => {
      captureErrorLog();
      await insertChannel();
      await follow(me);
      const regular = olderVideos().slice(0, 20);
      await getDb()
        .insert(youtubeVideos)
        .values([{ ...video("notified20h", 20 / 24, 20 / 24), notifiedAt: daysAgo(20 / 24) }, ...regular]);
      if (inRss) api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [feedEntry("notified20h", true)] });
      else api.fetchChannelFeed.mockRejectedValue(new TypeError("fetch failed"));
      api.checkIsShort.mockImplementation(async (videoId: string) => videoId === "notified20h");

      expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片");
      expect(await leftIds()).toEqual(["notified20h", ...regular.map((v) => v.videoId)].sort());

      expect(await cleanupVideos(new Date(NOW.getTime() + 2 * 24 * 3600_000))).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");
      expect((await recentVideos(me)).map((v) => v.videoId)).toEqual(regular.map((v) => v.videoId));
    });

    describe("頻道多、YouTube 又慢時不能拖垮排程", () => {
      const manyChannels = (count: number) => Array.from({ length: count }, (_, i) => `UC${String(i).padStart(22, "0")}`);
      const followAll = async (channelIds: string[]) => {
        for (const channelId of channelIds) {
          await insertChannel({ channelId, title: channelId });
          await follow(me, channelId);
        }
      };

      it("同時最多讀 4 個頻道的 RSS", async () => {
        const channels = manyChannels(9);
        await followAll(channels);
        let inFlight = 0;
        let peak = 0;
        api.fetchChannelFeed.mockImplementation(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((resolve) => setTimeout(resolve, 10));
          inFlight--;
          return { title: null, entries: [] };
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片");

        expect(api.fetchChannelFeed.mock.calls.map(([id]) => id).sort()).toEqual(channels);
        expect(peak).toBe(4);
      });

      it("讀 RSS 超過 60 秒_剩下的頻道略過（明天再試），摘要寫出略過幾個；下面的刪除照常", async () => {
        const channels = manyChannels(8);
        await followAll(channels);
        await getDb().insert(youtubeVideos).values(video("orphanoldvd", 3, 3, OTHER));
        api.fetchChannelFeed.mockImplementation(async (channelId: string) => {
          await Promise.resolve();
          // 第一個頻道讀了 61 秒才回來 已經送出的照常讀完 之後的不再送
          if (channelId === channels[0]) vi.setSystemTime(Date.now() + 61_000);
          return { title: null, entries: [] };
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片；略過 4 個頻道的 Shorts 檢查（超過時間，明天再試）");

        expect(api.fetchChannelFeed).toHaveBeenCalledTimes(4);
        expect(await leftIds()).toEqual([]);
      });

      it("60 秒內讀完_不略過", async () => {
        const channels = manyChannels(8);
        await followAll(channels);
        api.fetchChannelFeed.mockImplementation(async () => {
          vi.setSystemTime(Date.now() + 7_000);
          return { title: null, entries: [] };
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片");
        expect(api.fetchChannelFeed).toHaveBeenCalledTimes(8);
      });

      it("Shorts 這一步出錯（例如刪除時資料庫出錯）_下面的刪除照樣執行，摘要說 Shorts 檢查失敗；log 只記錯誤種類", async () => {
        const log = captureErrorLog();
        await insertChannel();
        await follow(me);
        await getDb().insert(youtubeVideos).values([video("shortshort1", 1, 1), video("orphanoldvd", 3, 3, OTHER)]);
        api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [feedEntry("shortshort1", true)] });
        // 第一個刪除是 Shorts 這一步的 之後的刪除照常
        vi.spyOn(testDb, "delete").mockImplementationOnce(() => {
          throw new Error("connection reset: secret-detail");
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片；Shorts 檢查失敗（詳見伺服器 log）");

        expect(await leftIds()).toEqual(["shortshort1"]);
        expect(loggedText(log)).toContain("清理 Shorts 失敗");
        expect(loggedText(log)).not.toContain("secret-detail");
      });
    });

    describe("RSS 認不出來、還在某人最新 20 支裡的影片（RSS 只有最新十幾支）：逐支請求 /shorts/ 確認，是 Shorts 就刪", () => {
      /**
       * 每支影片 YouTube 的回答 true 是 Shorts false 是一般影片
       * null 是無法判斷 Error 是請求失敗 沒列的是一般影片
       */
      const answers = (byId: Record<string, boolean | null | Error>) =>
        api.checkIsShort.mockImplementation(async (videoId: string) => {
          const answer = Object.hasOwn(byId, videoId) ? byId[videoId] : false;
          if (answer instanceof Error) throw answer;
          return answer;
        });
      const checkedIds = () => api.checkIsShort.mock.calls.map(([videoId]) => videoId).sort();

      it("上線前存進來、比 RSS 更舊的 Shorts_確認後刪掉（翻譯保留）；一般影片留著；RSS 裡有的不再請求；每支最多等 5 秒", async () => {
        await insertChannel();
        await follow(me);
        await getDb().insert(youtubeVideos).values([video("inrssnormal", 1, 1), video("oldshort001", 10, 10), video("oldnormal01", 11, 11)]);
        await getDb().insert(youtubeTranslations).values(translationOf("oldshort001"));
        api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [feedEntry("inrssnormal", false)] });
        answers({ oldshort001: true });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");

        expect(await leftIds()).toEqual(["inrssnormal", "oldnormal01"]);
        expect(checkedIds()).toEqual(["oldnormal01", "oldshort001"]);
        expect(api.checkIsShort).toHaveBeenCalledWith("oldshort001", { timeoutMs: 5_000 });
        expect((await testDb.select().from(youtubeTranslations)).map((t) => t.videoId)).toEqual(["oldshort001"]);
      });

      it("不在任何人最新 20 支裡的影片不請求（之後的步驟反正會刪掉）", async () => {
        await insertChannel();
        await follow(me);
        const videos = olderVideos();
        await getDb().insert(youtubeVideos).values(videos);

        expect(await cleanupVideos(NOW)).toBe("刪除 2 支不在任何人最新 20 支裡的影片");

        expect(checkedIds()).toEqual(videos.slice(0, 20).map((v) => v.videoId).sort());
      });

      it("刪掉 Shorts 後往前補進最新 20 支的影片也一起確認：清單上不會換成更舊的 Shorts", async () => {
        await insertChannel();
        await follow(me);
        const videos = olderVideos();
        await getDb().insert(youtubeVideos).values(videos);
        const shorts = [videos[0], videos[1], videos[20]].map((v) => v.videoId);
        answers(Object.fromEntries(shorts.map((videoId) => [videoId, true])));

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 3 支 Shorts");

        expect(await leftIds()).toEqual(videos.map((v) => v.videoId).filter((videoId) => !shorts.includes(videoId)).sort());
        expect(api.checkIsShort).toHaveBeenCalledTimes(22);
      });

      it("確認不了（被擋、同意頁）或請求失敗、逾時_當一般影片留著，log 只記錯誤種類；摘要寫出還有幾支沒確認（明天再試）", async () => {
        const log = captureErrorLog();
        await insertChannel();
        await follow(me);
        await getDb().insert(youtubeVideos).values([video("blockedvid1", 10, 10), video("brokenvid01", 11, 11), video("timeoutvid1", 12, 12)]);
        answers({
          blockedvid1: null,
          brokenvid01: new TypeError("fetch failed: secret-detail"),
          timeoutvid1: new DOMException("The operation was aborted due to timeout: secret-detail", "TimeoutError"),
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；還有 3 支影片沒確認是不是 Shorts（明天再試）");

        expect(await leftIds()).toEqual(["blockedvid1", "brokenvid01", "timeoutvid1"]);
        expect(loggedText(log)).toContain("TypeError");
        expect(loggedText(log)).toContain("TimeoutError");
        expect(loggedText(log)).not.toContain("secret-detail");
      });

      it("RSS 讀不到的頻道_清單上的影片也逐支確認；已經通知過、發布不到 48 小時的 Shorts 照樣先留著（hub 重送時找得到、不會重複通知）", async () => {
        captureErrorLog();
        await insertChannel();
        await follow(me);
        await getDb()
          .insert(youtubeVideos)
          .values([{ ...video("notified20h", 20 / 24, 20 / 24), notifiedAt: daysAgo(20 / 24) }, video("backfill-1d", 1, 1)]);
        api.fetchChannelFeed.mockRejectedValue(new TypeError("fetch failed"));
        answers({ notified20h: true, "backfill-1d": true });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");

        expect(await leftIds()).toEqual(["notified20h"]);
      });

      it("每次最多確認 50 支，新的先、同時最多 4 支；剩下的寫進摘要，明天再試", async () => {
        const carol = await insertTestUser(getDb(), "carol");
        const channels = [CH, OTHER, "UC" + "c".repeat(22)];
        const owners = [me, other, carol];
        // 三個人各追蹤一個頻道各 20 支 發布時間交錯 全都在某人的最新 20 支裡
        for (const [i, channelId] of channels.entries()) {
          await insertChannel({ channelId, title: channelId });
          await follow(owners[i], channelId);
          await getDb()
            .insert(youtubeVideos)
            .values(Array.from({ length: 20 }, (_, n) => video(`v${i}${String(n).padStart(2, "0")}xxxxxxx`, 3, n * 3 + i + 3, channelId)));
        }
        let inFlight = 0;
        let peak = 0;
        api.checkIsShort.mockImplementation(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight--;
          return false;
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；還有 10 支影片沒確認是不是 Shorts（明天再試）");

        const newest = (await testDb.select().from(youtubeVideos)).sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
        expect(checkedIds()).toEqual(newest.slice(0, 50).map((v) => v.videoId).sort());
        expect(peak).toBe(4);
      });

      it("讀 RSS 就用完 60 秒（Shorts 這一步總共 60 秒）_不再逐支確認，摘要寫出還有幾支沒確認；下面的刪除照常", async () => {
        await insertChannel();
        await follow(me);
        await getDb().insert(youtubeVideos).values([video("oldvideo001", 10, 10), video("oldvideo002", 11, 11), video("orphanoldvd", 3, 3, OTHER)]);
        api.fetchChannelFeed.mockImplementation(async () => {
          vi.setSystemTime(Date.now() + 61_000);
          return { title: null, entries: [] };
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片；還有 2 支影片沒確認是不是 Shorts（明天再試）");

        expect(api.checkIsShort).not.toHaveBeenCalled();
        expect(await leftIds()).toEqual(["oldvideo001", "oldvideo002"]);
      });

      it("逐支確認途中超過 60 秒_已經送出的照常等完（確認是 Shorts 的照樣刪），之後的不再送；沒輪到的寫進摘要，下面的刪除照常", async () => {
        await insertChannel();
        await follow(me);
        const videos = Array.from({ length: 10 }, (_, i) => video(`listed${String(i).padStart(5, "0")}`, i + 3, i + 3));
        await getDb()
          .insert(youtubeVideos)
          .values([...videos, video("orphanoldvd", 3, 3, OTHER)]);
        const [newest, second] = videos.map((v) => v.videoId);
        api.checkIsShort.mockImplementation(async (videoId: string) => {
          await Promise.resolve();
          // 最新那支回來時已經過了 61 秒 同時送出的 4 支照常等完 之後的不再送
          if (videoId === newest) vi.setSystemTime(Date.now() + 61_000);
          return videoId === second;
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts；還有 6 支影片沒確認是不是 Shorts（明天再試）");

        expect(api.checkIsShort).toHaveBeenCalledTimes(4);
        expect(await leftIds()).toEqual(videos.map((v) => v.videoId).filter((videoId) => videoId !== second));
      });

      it("逐支確認後刪除時出錯（例如資料庫斷線）_下面的刪除照樣執行，摘要說 Shorts 檢查失敗；log 只記錯誤種類", async () => {
        const log = captureErrorLog();
        await insertChannel();
        await follow(me);
        await getDb().insert(youtubeVideos).values([video("oldshort001", 10, 10), video("orphanoldvd", 3, 3, OTHER)]);
        answers({ oldshort001: true });
        // RSS 裡沒有 Shorts 第一個刪除就是逐支確認之後的 之後的刪除照常
        vi.spyOn(testDb, "delete").mockImplementationOnce(() => {
          throw new Error("connection reset: secret-detail");
        });

        expect(await cleanupVideos(NOW)).toBe("刪除 1 支不在任何人最新 20 支裡的影片；Shorts 檢查失敗（詳見伺服器 log）");

        expect(api.checkIsShort).toHaveBeenCalledWith("oldshort001", { timeoutMs: 5_000 });
        expect(await leftIds()).toEqual(["oldshort001"]);
        expect(loggedText(log)).toContain("清理 Shorts 失敗");
        expect(loggedText(log)).not.toContain("secret-detail");
      });
    });
  });

  it("送到資料庫的參數沒有 Date 物件：正式環境經 drizzle 的 postgres-js 收到 Date 會丟錯，整個排程失敗", async () => {
    await insertChannel();
    await follow(me);
    await getDb().insert(youtubeVideos).values([{ ...video("shortshort1", 3, 3), notifiedAt: daysAgo(3) }, ...olderVideos()]);
    api.fetchChannelFeed.mockResolvedValue({ title: "뉴진스", entries: [{ videoId: "shortshort1", channelId: CH, title: "s", published: daysAgo(3), url: "", isShort: true }] });
    const query = vi.spyOn(pgliteOf(testDb), "query");

    expect(await cleanupVideos(NOW)).toBe("刪除 2 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");

    expect(query).toHaveBeenCalled();
    expect(dateParams(query)).toEqual([]);
  });

  it("逐支確認後刪掉 Shorts 時，送到資料庫的參數也沒有 Date 物件", async () => {
    await insertChannel();
    await follow(me);
    await getDb()
      .insert(youtubeVideos)
      .values({ ...video("oldshort001", 10, 10), notifiedAt: daysAgo(10) });
    api.checkIsShort.mockResolvedValue(true);
    const query = vi.spyOn(pgliteOf(testDb), "query");

    expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片；刪除 1 支 Shorts");

    expect(await leftIds()).toEqual([]);
    expect(dateParams(query)).toEqual([]);
  });

  it("發布 48 小時內的影片_不在任何人的最新 20 支裡也先留著_之後 hub 再推送仍能去重", async () => {
    await getDb().insert(youtubeVideos).values(video("premierepre", 20, 1));

    expect(await cleanupVideos(NOW)).toBe("刪除 0 支不在任何人最新 20 支裡的影片");
    expect(await testDb.select().from(youtubeVideos)).toHaveLength(1);
  });
});
