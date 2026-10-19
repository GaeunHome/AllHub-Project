import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubYoutubeEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf, tagged } from "@/dev/test-helpers";
import { youtubeChannels, youtubeFollows, youtubeVideos } from "../data/schema";
import { CHANNEL_ID as CH, VIDEO_ID as VIDEO } from "../dev/fixtures";

vi.mock("../lib/api", { spy: true });

stubYoutubeEnv();

const api = mocksOf(await import("../lib/api"), "fetchChannelAvatar", "fetchVideoInfo");
const { cachedChannelAvatar, cachedFollowedVideo, cachedVideoInfo } = await import("./cached");

const AVATAR = "https://yt3.googleusercontent.com/abc=s176-c-k";

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

beforeEach(() => {
  api.fetchChannelAvatar.mockReset().mockResolvedValue(AVATAR);
  api.fetchVideoInfo.mockReset().mockResolvedValue({ title: "새 영상", channelName: "NewJeans", channelUrl: "https://www.youtube.com/@NewJeans_official" });
});

describe("cachedChannelAvatar：頻道頁的頭像，外部資料不存資料庫", () => {
  it("參數是頻道 id_回傳頭像網址_標 youtube:external_效期一天（avatar）", async () => {
    expect(await cachedChannelAvatar(CH)).toBe(AVATAR);

    expect(api.fetchChannelAvatar).toHaveBeenCalledWith(CH);
    expect(tagged()).toEqual(["youtube:external"]);
    expect(cacheLife).toHaveBeenCalledWith("avatar");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("讀不到頭像_null_改用短效期（external），YouTube 暫時擋下時不會一整天都是文字頭像", async () => {
    api.fetchChannelAvatar.mockResolvedValue(null);

    expect(await cachedChannelAvatar(CH)).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("連線錯誤或逾時_不丟錯_null_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    api.fetchChannelAvatar.mockRejectedValue(Object.assign(new Error("timeout https://www.youtube.com/channel/secret-path"), { name: "TimeoutError" }));

    expect(await cachedChannelAvatar(CH)).toBeNull();
    expect(loggedText(log)).toContain("TimeoutError");
    expect(loggedText(log)).not.toContain("secret-path");
  });
});

describe("cachedFollowedVideo：觀看頁的標題與上方的頻道（自己追蹤中頻道的影片）", () => {
  it("影片在自己追蹤的頻道_回傳標題、頻道 id、名稱與資料庫裡的頭像_標影片、頻道與追蹤三張表", async () => {
    const me = await insertTestUser(testDb, "alice");
    await testDb.insert(youtubeChannels).values({ channelId: CH, title: "뉴진스", thumbnail: "https://yt3.ggpht.com/old" });
    await testDb.insert(youtubeFollows).values({ userId: me, channelId: CH });
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상" });

    expect(await cachedFollowedVideo(me, VIDEO)).toEqual({ title: "새 영상", channelId: CH, channelTitle: "뉴진스", thumbnail: "https://yt3.ggpht.com/old" });
    expect(tagged()).toEqual(["youtube:channels", "youtube:follows", "youtube:videos"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("沒追蹤的影片_null", async () => {
    const me = await insertTestUser(testDb, "alice");
    expect(await cachedFollowedVideo(me, "zzzzzzzzzzz")).toBeNull();
  });

  it("別人追蹤、自己沒追蹤的頻道的影片_當作沒追蹤（null，改用 oEmbed）", async () => {
    const [me, other] = await insertTestUsers(testDb);
    await testDb.insert(youtubeChannels).values({ channelId: CH, title: "뉴진스" });
    await testDb.insert(youtubeFollows).values({ userId: other, channelId: CH });
    await testDb.insert(youtubeVideos).values({ videoId: VIDEO, channelId: CH, title: "새 영상" });

    expect(await cachedFollowedVideo(me, VIDEO)).toBeNull();
  });
});

describe("cachedVideoInfo：沒追蹤的影片用 oEmbed 補標題與頻道", () => {
  it("回傳 oEmbed 的資訊_標 youtube:external_效期一天", async () => {
    expect(await cachedVideoInfo(VIDEO)).toMatchObject({ title: "새 영상", channelName: "NewJeans" });
    expect(tagged()).toEqual(["youtube:external"]);
    expect(cacheLife).toHaveBeenCalledWith("avatar");
  });

  it("讀不到_null_短效期", async () => {
    api.fetchVideoInfo.mockResolvedValue(null);

    expect(await cachedVideoInfo(VIDEO)).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
  });

  it("連線錯誤或逾時_不丟錯_null_短效期_log 只記錯誤種類（畫面照常顯示，開始翻譯時標題存 null）", async () => {
    const log = captureErrorLog();
    api.fetchVideoInfo.mockRejectedValue(Object.assign(new Error("timeout https://www.youtube.com/oembed?secret-path"), { name: "TimeoutError" }));

    expect(await cachedVideoInfo(VIDEO)).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).toContain("TimeoutError");
    expect(loggedText(log)).not.toContain("secret-path");
  });
});
