import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { mocksOf } from "@/dev/test-helpers";
import { youtubeChannels, youtubeFollows, youtubeVideos } from "../data/schema";

vi.mock("../lib/subtitles/captions", { spy: true });

const { listCaptionTracks } = mocksOf(await import("../lib/subtitles/captions"), "listCaptionTracks");
const captionStatus = await import("./caption-status");
const { RECHECK_BATCH, checkChineseCaptions } = captionStatus;

const CH = "UC" + "a".repeat(22);
const NOW = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600_000);

const getDb = setupTestDb();
let me: string;
let other: string;
/** 背景重新檢查只處理這個人追蹤的頻道；沒特別說的都是 me（追蹤 CH） */
const recheckDueCaptions = (now: Date) => captionStatus.recheckDueCaptions(me, now);

const ZH = { ok: true, tracks: [{ languageCode: "zh-TW", automatic: false, translated: false }] };
const KO = { ok: true, tracks: [{ languageCode: "ko", automatic: false, translated: false }] };
const BLOCKED = { ok: false, reason: "blocked", message: "要求驗證" };

type VideoSeed = Partial<typeof youtubeVideos.$inferInsert> & { videoId: string };
const insertVideos = (...videos: VideoSeed[]) =>
  getDb()
    .insert(youtubeVideos)
    .values(videos.map((v) => ({ channelId: CH, title: v.videoId, publishedAt: hoursAgo(2), ...v })));
const videoRow = async (videoId: string) => (await getDb().select().from(youtubeVideos).where(eq(youtubeVideos.videoId, videoId)))[0];

beforeEach(async () => {
  listCaptionTracks.mockReset().mockResolvedValue(KO);
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  await getDb().insert(youtubeChannels).values({ channelId: CH, title: "뉴진스" });
  await getDb().insert(youtubeFollows).values({ userId: me, channelId: CH });
});

describe("checkChineseCaptions", () => {
  it.each([
    ["有人工中文字幕", ZH, "yes"],
    ["沒有中文字幕", KO, "no"],
    ["抓不到", BLOCKED, "unknown"],
  ] as const)("%s → %s_記下檢查時間", async (_name, result, status) => {
    await insertVideos({ videoId: "aaaaaaaaaaa" });
    listCaptionTracks.mockResolvedValue(result);

    expect(await checkChineseCaptions("aaaaaaaaaaa", NOW)).toBe(status);

    expect(await videoRow("aaaaaaaaaaa")).toMatchObject({ zhCaptions: status, zhCaptionsCheckedAt: NOW });
  });

  it("之前確認過沒有中文、這次抓不到_維持「沒有」，只更新檢查時間", async () => {
    await insertVideos({ videoId: "aaaaaaaaaaa", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(3) });
    listCaptionTracks.mockResolvedValue(BLOCKED);

    expect(await checkChineseCaptions("aaaaaaaaaaa", NOW)).toBe("no");
    expect(await videoRow("aaaaaaaaaaa")).toMatchObject({ zhCaptions: "no", zhCaptionsCheckedAt: NOW });
  });

  it("不在影片清單裡的影片_回 null、不寫入", async () => {
    expect(await checkChineseCaptions("zzzzzzzzzzz", NOW)).toBeNull();
  });
});

describe("recheckDueCaptions（影片清單顯示時在背景重新檢查）", () => {
  it("只重新檢查：發布 48 小時內、狀態是沒有或無法確認、距離上次檢查超過 1 小時（或從沒檢查過）", async () => {
    await insertVideos(
      { videoId: "due-no-old1", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(2) },
      { videoId: "due-unknown", zhCaptions: "unknown", zhCaptionsCheckedAt: null },
      { videoId: "skip-yes-01", zhCaptions: "yes", zhCaptionsCheckedAt: hoursAgo(5) },
      { videoId: "skip-recent", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(0.5) },
      { videoId: "skip-oldvid", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(5), publishedAt: hoursAgo(49) },
      { videoId: "skip-nopub1", zhCaptions: "unknown", publishedAt: null },
    );
    listCaptionTracks.mockResolvedValue(ZH);

    expect(await recheckDueCaptions(NOW)).toBe(2);

    expect(listCaptionTracks.mock.calls.map((c) => c[0]).sort()).toEqual(["due-no-old1", "due-unknown"]);
    expect((await videoRow("due-no-old1")).zhCaptions).toBe("yes");
    expect((await videoRow("skip-recent")).zhCaptions).toBe("no");
  });

  it("同時觸發兩次（例如連續重新整理）_同一支影片只檢查一次", async () => {
    await insertVideos({ videoId: "aaaaaaaaaaa" }, { videoId: "bbbbbbbbbbb" });

    const [first, second] = await Promise.all([recheckDueCaptions(NOW), recheckDueCaptions(NOW)]);

    expect(first + second).toBe(2);
    expect(listCaptionTracks).toHaveBeenCalledTimes(2);
  });

  it("一次最多檢查 5 支_避免一口氣對 YouTube 發太多請求", async () => {
    await insertVideos(...Array.from({ length: RECHECK_BATCH + 3 }, (_, i) => ({ videoId: `video${String(i).padStart(6, "0")}` })));

    expect(await recheckDueCaptions(NOW)).toBe(RECHECK_BATCH);
    expect(RECHECK_BATCH).toBe(5);
    expect(listCaptionTracks).toHaveBeenCalledTimes(RECHECK_BATCH);
  });

  it("剛檢查過的_一小時內再顯示清單不會重複檢查", async () => {
    await insertVideos({ videoId: "aaaaaaaaaaa" });

    await recheckDueCaptions(NOW);
    expect(await recheckDueCaptions(new Date(NOW.getTime() + 30 * 60_000))).toBe(0);
    expect(listCaptionTracks).toHaveBeenCalledOnce();
  });

  it("某一支檢查出錯_其他照樣檢查，不往外丟", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    await insertVideos({ videoId: "aaaaaaaaaaa" }, { videoId: "bbbbbbbbbbb" });
    listCaptionTracks.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ZH);

    await expect(recheckDueCaptions(NOW)).resolves.toBe(2);
    expect((await getDb().select().from(youtubeVideos)).map((v) => v.zhCaptions).sort()).toEqual(["unknown", "yes"]);
  });
});

describe("依使用者：只處理自己追蹤頻道的影片", () => {
  it("背景重新檢查只檢查自己追蹤頻道的影片", async () => {
    const OTHER_CH = "UC" + "b".repeat(22);
    await getDb().insert(youtubeChannels).values({ channelId: OTHER_CH, title: "別的頻道" });
    await getDb().insert(youtubeFollows).values({ userId: other, channelId: OTHER_CH });
    await insertVideos({ videoId: "minemineaaa" }, { videoId: "theirstheir", channelId: OTHER_CH });

    expect(await captionStatus.recheckDueCaptions(me, NOW)).toBe(1);
    expect(listCaptionTracks.mock.calls.map(([id]) => id)).toEqual(["minemineaaa"]);
    expect((await captionStatus.recheckCandidates(other)).map((c) => c.videoId)).toEqual(["theirstheir"]);
  });

  it("手動重新檢查：自己追蹤頻道的影片照常檢查；別人追蹤、自己沒追蹤的影片當作不在清單裡（回 null、不檢查）", async () => {
    await insertVideos({ videoId: "aaaaaaaaaaa" });
    listCaptionTracks.mockResolvedValue(ZH);

    expect(await captionStatus.checkFollowedVideoCaptions(other, "aaaaaaaaaaa", NOW)).toBeNull();
    expect(listCaptionTracks).not.toHaveBeenCalled();
    expect(await captionStatus.checkFollowedVideoCaptions(me, "aaaaaaaaaaa", NOW)).toBe("yes");
  });
});
