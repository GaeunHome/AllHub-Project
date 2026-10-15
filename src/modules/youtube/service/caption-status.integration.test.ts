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
/** 背景重新檢查只處理這個人追蹤的頻道 沒特別說的都是追蹤 CH 的 me */
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
  it("檢查過的只重新檢查：發布 48 小時內、狀態是沒有或無法確認、距離上次檢查超過 1 小時", async () => {
    await insertVideos(
      { videoId: "due-no-old1", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(2) },
      { videoId: "due-unknown", zhCaptions: "unknown", zhCaptionsCheckedAt: hoursAgo(2) },
      { videoId: "skip-yes-01", zhCaptions: "yes", zhCaptionsCheckedAt: hoursAgo(5) },
      { videoId: "skip-recent", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(0.5) },
      { videoId: "skip-oldvid", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(5), publishedAt: hoursAgo(49) },
      { videoId: "skip-nopub1", zhCaptions: "unknown", zhCaptionsCheckedAt: hoursAgo(5), publishedAt: null },
    );
    listCaptionTracks.mockResolvedValue(ZH);

    expect(await recheckDueCaptions(NOW)).toBe(2);

    expect(listCaptionTracks.mock.calls.map((c) => c[0]).sort()).toEqual(["due-no-old1", "due-unknown"]);
    expect((await videoRow("due-no-old1")).zhCaptions).toBe("yes");
    expect((await videoRow("skip-recent")).zhCaptions).toBe("no");
  });

  it("從來沒檢查過的（例如追蹤時從 RSS 補進來的舊影片）_不論發布多久都檢查一次；確認過沒有中文、發布超過 48 小時的就不再檢查", async () => {
    await insertVideos(
      { videoId: "never-old01", publishedAt: hoursAgo(24 * 10) },
      { videoId: "never-nopub", publishedAt: null },
      { videoId: "never-yes01", zhCaptions: "yes", publishedAt: hoursAgo(24 * 10) },
    );

    expect(await recheckDueCaptions(NOW)).toBe(2);
    expect(listCaptionTracks.mock.calls.map((c) => c[0]).sort()).toEqual(["never-nopub", "never-old01"]);

    expect(await recheckDueCaptions(new Date(NOW.getTime() + 5 * 3600_000))).toBe(0);
    expect(listCaptionTracks).toHaveBeenCalledTimes(2);
  });

  it("從來沒檢查過的超過一次的量_新的先檢查（沒有發布時間的排最後）", async () => {
    await insertVideos(
      { videoId: "nopub000000", publishedAt: null },
      ...Array.from({ length: RECHECK_BATCH }, (_, i) => ({ videoId: `old${String(i).padStart(8, "0")}`, publishedAt: hoursAgo(24 * (i + 3)) })),
      { videoId: "newest00000", publishedAt: hoursAgo(1) },
    );

    expect(await recheckDueCaptions(NOW)).toBe(RECHECK_BATCH);
    expect(listCaptionTracks.mock.calls.map((c) => c[0])).toEqual(["newest00000", ...Array.from({ length: RECHECK_BATCH - 1 }, (_, i) => `old${String(i).padStart(8, "0")}`)]);
  });

  it("名額有限時最久沒檢查的先（從沒檢查過的排最前）：近期影片每小時到期，也不會讓從 RSS 補進來的舊影片一直輪不到", async () => {
    // 審查時重現的情況 8 支檢查過沒有中文的近期影片加 12 支從沒檢查過的舊影片
    // 每 2 小時打開一次頁面 持續 24 小時
    const recent = Array.from({ length: 8 }, (_, i) => `recent${String(i).padStart(5, "0")}`);
    const backfilled = Array.from({ length: 12 }, (_, i) => `backfill${String(i).padStart(3, "0")}`);
    await insertVideos(
      ...recent.map((videoId, i) => ({ videoId, publishedAt: hoursAgo(i + 1), zhCaptions: "no" as const, zhCaptionsCheckedAt: hoursAgo(1.5) })),
      ...backfilled.map((videoId, i) => ({ videoId, publishedAt: hoursAgo(24 * (i + 3)) })),
    );

    for (let hour = 0; hour < 24; hour += 2) await recheckDueCaptions(new Date(NOW.getTime() + hour * 3600_000));

    const checked = new Set(listCaptionTracks.mock.calls.map(([id]) => id));
    expect(backfilled.filter((id) => !checked.has(id))).toEqual([]);
    expect(recent.filter((id) => !checked.has(id))).toEqual([]);
  });

  it("從沒檢查過的先輪完，接著是最久沒檢查的；同一組裡新的先", async () => {
    await insertVideos(
      { videoId: "chk-3h-ago0", publishedAt: hoursAgo(5), zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(3) },
      { videoId: "chk-72m-ago", publishedAt: hoursAgo(1.5), zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(1.2) },
      { videoId: "chk-2h-ago0", publishedAt: hoursAgo(10), zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(2) },
      { videoId: "never-old01", publishedAt: hoursAgo(24 * 9) },
      { videoId: "never-new01", publishedAt: hoursAgo(3) },
      { videoId: "never-nopub", publishedAt: null },
    );

    expect(await recheckDueCaptions(NOW)).toBe(RECHECK_BATCH);

    expect(listCaptionTracks.mock.calls.map(([id]) => id)).toEqual(["never-new01", "never-old01", "never-nopub", "chk-3h-ago0", "chk-2h-ago0"]);
  });

  it("只檢查自己清單上的最新 20 支：更舊、畫面上看不到（之後會被清掉）的影片不對 YouTube 發請求", async () => {
    await insertVideos(
      ...Array.from({ length: 19 }, (_, i) => ({ videoId: `listedyes${String(i).padStart(2, "0")}`, publishedAt: hoursAgo(i + 1), zhCaptions: "yes" as const, zhCaptionsCheckedAt: hoursAgo(1) })),
      { videoId: "listed-20th", publishedAt: hoursAgo(24 * 3) },
      { videoId: "beyond-list", publishedAt: hoursAgo(24 * 30) },
      { videoId: "beyondnopub", publishedAt: null },
    );

    expect((await captionStatus.recheckCandidates(me)).map((c) => c.videoId)).toEqual(["listed-20th"]);
    expect(await recheckDueCaptions(NOW)).toBe(1);
    expect(listCaptionTracks.mock.calls.map(([id]) => id)).toEqual(["listed-20th"]);
  });

  it("檢查過但讀不到（無法確認）的_不論發布多久，超過 24 小時再試一次；確認過沒有中文的舊影片不再檢查", async () => {
    await insertVideos(
      { videoId: "unknown-25h", zhCaptions: "unknown", zhCaptionsCheckedAt: hoursAgo(25), publishedAt: hoursAgo(24 * 10) },
      { videoId: "unknown-nop", zhCaptions: "unknown", zhCaptionsCheckedAt: hoursAgo(25), publishedAt: null },
      { videoId: "unknown-23h", zhCaptions: "unknown", zhCaptionsCheckedAt: hoursAgo(23), publishedAt: hoursAgo(24 * 10) },
      { videoId: "nozh-25h-ol", zhCaptions: "no", zhCaptionsCheckedAt: hoursAgo(25), publishedAt: hoursAgo(24 * 10) },
    );
    // 一直被 YouTube 擋下時狀態維持無法確認
    // 每支一天最多試一次 不會每次打開頁面都重試
    listCaptionTracks.mockResolvedValue(BLOCKED);

    expect(await recheckDueCaptions(NOW)).toBe(2);
    expect(listCaptionTracks.mock.calls.map(([id]) => id).sort()).toEqual(["unknown-25h", "unknown-nop"]);

    expect(await recheckDueCaptions(new Date(NOW.getTime() + 23 * 3600_000))).toBe(1);
    expect(listCaptionTracks.mock.calls.at(-1)?.[0]).toBe("unknown-23h");

    expect(await recheckDueCaptions(new Date(NOW.getTime() + 24.5 * 3600_000))).toBe(2);
    expect(listCaptionTracks).toHaveBeenCalledTimes(5);
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
