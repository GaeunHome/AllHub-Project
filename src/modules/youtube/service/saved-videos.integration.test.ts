import type { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { youtubeChannels, youtubeFollows, youtubeSavedVideos, youtubeTranslations, youtubeVideos } from "../data/schema";
import { CHANNEL_ID as CH, VIDEO_ID as VIDEO } from "../dev/fixtures";

stubCoreEnv();

const { SAVED_LIMIT, keepVideo, listSavedVideos, removeSavedVideo } = await import("./saved-videos");

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

/** 11 碼的假影片 id 依序是 video000000 video000001 */
const idOf = (i: number) => `video${String(i).padStart(6, "0")}`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** 直接寫進清單 越後面的 updated_at 越新 */
async function seed(userId: string, entries: { videoId: string; pinned: boolean }[]) {
  if (entries.length === 0) return;
  await testDb.insert(youtubeSavedVideos).values(
    entries.map((entry, i) => ({ userId, videoId: entry.videoId, pinned: entry.pinned, title: `標題 ${entry.videoId}`, updatedAt: minutesAgo(1000 - i), createdAt: minutesAgo(1000 - i) })),
  );
}

const rowsOf = (userId: string) => testDb.select().from(youtubeSavedVideos).where(eq(youtubeSavedVideos.userId, userId)).orderBy(asc(youtubeSavedVideos.videoId));
const rowOf = async (userId: string, videoId: string) =>
  (await testDb.select().from(youtubeSavedVideos).where(and(eq(youtubeSavedVideos.userId, userId), eq(youtubeSavedVideos.videoId, videoId))))[0];
const lookupOf = (snapshot: { title: string | null; channelTitle: string | null } | null) => vi.fn(async () => snapshot);

/** setupTestDb 底下的 PGlite TestDb 的型別沒有列出 drizzle 的 $client */
const pgliteOf = (db: TestDb) => (db as TestDb & { $client: PGlite }).$client;

/**
 * 換成會記下每句 SQL 的連線 用同一個 PGlite 交易裡的也記得到
 * BEGIN 由 PGlite 自己送 所以開始交易時另外記一筆
 */
function logQueries(): string[] {
  const queries: string[] = [];
  const pglite = pgliteOf(testDb);
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    queries.push("begin");
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (query) => queries.push(query) } });
  return queries;
}

beforeEach(async () => {
  [me, other] = await insertTestUsers(testDb);
});

describe("手動保留（觀看頁的「保留」）", () => {
  it("自己追蹤頻道的影片_標題與頻道名稱從資料庫拿，不向外查", async () => {
    await testDb.insert(youtubeChannels).values({ channelId: CH, title: "뉴진스" });
    await testDb.insert(youtubeFollows).values({ userId: me, channelId: CH });
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상" });
    const lookup = lookupOf({ title: "oEmbed 標題", channelTitle: "oEmbed 頻道" });

    expect(await keepVideo(me, VIDEO, { pinned: true, lookup })).toBe("saved");

    expect(await rowOf(me, VIDEO)).toMatchObject({ pinned: true, title: "새 영상", channelTitle: "뉴진스" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("其他影片_頻道名稱用呼叫端給的（觀看頁讀過的 oEmbed）；標題跟觀看頁一樣先用共用翻譯存的", async () => {
    await testDb.insert(youtubeTranslations).values({ videoId: VIDEO, title: "翻譯存的標題", sourceKind: "manual", sourceCues: [], translated: [], batches: [] });
    // 別人追蹤的頻道不算 標題與頻道名稱不從別人的追蹤拿
    await testDb.insert(youtubeChannels).values({ channelId: CH, title: "別人追蹤的頻道" });
    await testDb.insert(youtubeFollows).values({ userId: other, channelId: CH });
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "別人清單上的標題" });
    const lookup = lookupOf({ title: "oEmbed 標題", channelTitle: "oEmbed 頻道" });

    await keepVideo(me, VIDEO, { pinned: true, lookup });

    expect(await rowOf(me, VIDEO)).toMatchObject({ title: "翻譯存的標題", channelTitle: "oEmbed 頻道" });
  });

  it("讀不到標題（oEmbed 沒有、出錯或沒給）_存 null，照樣保留；錯誤 log 只記種類", async () => {
    const log = captureErrorLog();
    const failing = vi.fn(async () => {
      throw new Error("secret-detail");
    });

    expect(await keepVideo(me, idOf(1), { pinned: true, lookup: lookupOf(null) })).toBe("saved");
    expect(await keepVideo(me, idOf(2), { pinned: true, lookup: failing })).toBe("saved");
    expect(await keepVideo(me, idOf(3), { pinned: true })).toBe("saved");

    expect((await rowsOf(me)).map((row) => [row.videoId, row.title, row.channelTitle])).toEqual([
      [idOf(1), null, null],
      [idOf(2), null, null],
      [idOf(3), null, null],
    ]);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("已經在清單裡的自動項目_改成手動並更新時間；新讀到的標題補上，讀不到的不蓋掉原本的", async () => {
    await seed(me, [{ videoId: VIDEO, pinned: false }]);
    const before = await rowOf(me, VIDEO);

    expect(await keepVideo(me, VIDEO, { pinned: true, lookup: lookupOf({ title: null, channelTitle: "頻道" }) })).toBe("saved");

    const after = await rowOf(me, VIDEO);
    expect(after).toMatchObject({ pinned: true, title: `標題 ${VIDEO}`, channelTitle: "頻道" });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(await rowsOf(me)).toHaveLength(1);
  });
});

describe("自動加入（按過翻譯）", () => {
  it("新的影片_記成自動加入（pinned = false）", async () => {
    expect(await keepVideo(me, VIDEO, { pinned: false })).toBe("saved");

    expect(await rowOf(me, VIDEO)).toMatchObject({ pinned: false });
  });

  it("已經在清單裡_只更新時間；手動保留的維持手動", async () => {
    await seed(me, [{ videoId: VIDEO, pinned: true }]);
    const before = await rowOf(me, VIDEO);

    await keepVideo(me, VIDEO, { pinned: false });

    const after = await rowOf(me, VIDEO);
    expect(after.pinned).toBe(true);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});

describe(`每人最多 ${SAVED_LIMIT} 部`, () => {
  const pinned = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ videoId: idOf(from + i), pinned: true }));
  const autos = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ videoId: idOf(from + i), pinned: false }));
  const idsOf = async (userId: string) => (await rowsOf(userId)).map((row) => row.videoId).sort();

  it("手動保留_滿了先擠掉最舊的自動項目", async () => {
    // 最舊的是自動的 0 1 中間夾著手動的 2 到 11 最新的是自動的 12 到 14
    await seed(me, [...autos(0, 2), ...pinned(2, 10), ...autos(12, 3)]);

    expect(await keepVideo(me, VIDEO, { pinned: true })).toBe("saved");

    const ids = await idsOf(me);
    expect(ids).toHaveLength(15);
    expect(ids).toContain(VIDEO);
    expect(ids).not.toContain(idOf(0));
    expect(ids).toContain(idOf(1));
  });

  it("手動保留_15 部都是手動的_拒絕，清單不變", async () => {
    await seed(me, pinned(0, 15));

    expect(await keepVideo(me, VIDEO, { pinned: true })).toBe("full");

    expect(await idsOf(me)).toEqual(pinned(0, 15).map((entry) => entry.videoId));
  });

  it("自動加入_滿了擠掉最舊的自動項目", async () => {
    await seed(me, [...pinned(0, 13), ...autos(13, 2)]);

    expect(await keepVideo(me, VIDEO, { pinned: false })).toBe("saved");

    const ids = await idsOf(me);
    expect(ids).toHaveLength(15);
    expect(ids).not.toContain(idOf(13));
    expect(ids).toContain(idOf(14));
    expect(await rowOf(me, VIDEO)).toMatchObject({ pinned: false });
  });

  it("自動加入_15 部都是手動的_略過（不報錯），清單不變", async () => {
    await seed(me, pinned(0, 15));

    expect(await keepVideo(me, VIDEO, { pinned: false })).toBe("full");

    expect(await idsOf(me)).toEqual(pinned(0, 15).map((entry) => entry.videoId));
  });

  it("已經在清單裡的影片不算新的一部：滿了也能改成手動、更新時間", async () => {
    await seed(me, [...pinned(0, 14), { videoId: VIDEO, pinned: false }]);

    expect(await keepVideo(me, VIDEO, { pinned: true })).toBe("saved");
    expect(await keepVideo(me, idOf(0), { pinned: false })).toBe("saved");

    expect(await idsOf(me)).toHaveLength(15);
    expect(await rowOf(me, VIDEO)).toMatchObject({ pinned: true });
  });

  it("上限只算自己的：別人保留滿 15 部，不影響我", async () => {
    await seed(other, pinned(0, 15));

    expect(await keepVideo(me, idOf(0), { pinned: true })).toBe("saved");

    expect(await idsOf(other)).toHaveLength(15);
    expect(await idsOf(me)).toEqual([idOf(0)]);
  });

  it("同時保留好幾部_不會超過 15 部", async () => {
    await seed(me, pinned(0, 13));

    const results = await Promise.all([20, 21, 22, 23].map((i) => keepVideo(me, idOf(i), { pinned: true })));

    expect(results.filter((result) => result === "saved")).toHaveLength(2);
    expect(results.filter((result) => result === "full")).toHaveLength(2);
    expect(await idsOf(me)).toHaveLength(15);
  });

  it("數之前先在同一個交易裡鎖住這個使用者（core_users 那一列）：只鎖清單的列擋不住同時新增的列；PGlite 只有一條連線、交易本來就一個一個跑，所以直接看送出的 SQL", async () => {
    const queries = logQueries();

    await keepVideo(me, VIDEO, { pinned: true });

    const begin = queries.findIndex((query) => /^begin/i.test(query));
    const lock = queries.findIndex((query) => /from "core_users" where .* for no key update$/i.test(query));
    const count = queries.findIndex((query) => /from "youtube_saved_videos"/i.test(query));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(count).toBeGreaterThan(lock);
  });
});

describe("清單與移除：只看得到、動得到自己的", () => {
  it("listSavedVideos_只列自己的、新的在前；帶翻譯狀態，沒存標題時用共用翻譯的標題", async () => {
    await seed(me, [
      { videoId: idOf(1), pinned: true },
      { videoId: idOf(2), pinned: false },
    ]);
    await seed(other, [{ videoId: idOf(3), pinned: true }]);
    await testDb.update(youtubeSavedVideos).set({ title: null, channelTitle: "頻道" }).where(eq(youtubeSavedVideos.videoId, idOf(1)));
    await testDb.insert(youtubeTranslations).values([
      { videoId: idOf(1), title: "翻譯的標題", status: "done", sourceKind: "manual", sourceCues: [], translated: [], batches: [] },
      { videoId: idOf(2), title: "另一支", status: "running", sourceKind: "auto", sourceCues: [], translated: [], batches: [] },
    ]);

    const list = await listSavedVideos(me);

    expect(list.map((video) => video.videoId)).toEqual([idOf(2), idOf(1)]);
    expect(list[0]).toMatchObject({ title: `標題 ${idOf(2)}`, pinned: false, translationStatus: "running" });
    expect(list[1]).toMatchObject({ title: "翻譯的標題", channelTitle: "頻道", pinned: true, translationStatus: "done" });
    expect(list[1].savedAt).toBeInstanceOf(Date);
    expect(await listSavedVideos(other)).toEqual([expect.objectContaining({ videoId: idOf(3), translationStatus: null })]);
  });

  it("removeSavedVideo_只刪自己的那一列；別人保留的同一支、只有別人保留的影片都不受影響（IDOR）", async () => {
    await seed(me, [{ videoId: idOf(1), pinned: true }]);
    await seed(other, [
      { videoId: idOf(1), pinned: true },
      { videoId: idOf(2), pinned: false },
    ]);

    expect(await removeSavedVideo(me, idOf(1))).toBe(true);
    expect(await removeSavedVideo(me, idOf(2))).toBe(false);

    expect(await rowsOf(me)).toEqual([]);
    expect((await rowsOf(other)).map((row) => row.videoId)).toEqual([idOf(1), idOf(2)]);
  });

  it("影片 id 只收 11 碼：網址或其他字串不寫入、不刪除", async () => {
    await seed(me, [{ videoId: VIDEO, pinned: true }]);

    await expect(keepVideo(me, `https://youtu.be/${VIDEO}`, { pinned: true })).rejects.toThrow("影片 ID 格式不正確");
    await expect(keepVideo(me, "short", { pinned: false })).rejects.toThrow("影片 ID 格式不正確");
    await expect(removeSavedVideo(me, `${VIDEO}x`)).rejects.toThrow("影片 ID 格式不正確");

    expect((await rowsOf(me)).map((row) => row.videoId)).toEqual([VIDEO]);
  });
});
