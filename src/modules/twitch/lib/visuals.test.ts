import { describe, expect, it } from "vitest";
import { cacheKeyIds, formatLiveDuration, formatViewerCount, mergeStreamerVisuals, pickLiveNow, sizedImageUrl, toGameArt, toLiveStream, toProfile } from "./visuals";

describe("sizedImageUrl：Helix 的圖片網址樣板換成實際尺寸", () => {
  it("直播預覽圖的 {width}x{height}", () => {
    expect(sizedImageUrl("https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-{width}x{height}.jpg", 640, 360)).toBe(
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-640x360.jpg",
    );
  });

  it("遊戲封面的樣板", () => {
    expect(sizedImageUrl("https://static-cdn.jtvnw.net/ttv-boxart/1234-{width}x{height}.jpg", 72, 96)).toBe("https://static-cdn.jtvnw.net/ttv-boxart/1234-72x96.jpg");
  });

  it("沒有樣板的網址原樣回傳_空字串或沒給回 null", () => {
    expect(sizedImageUrl("https://static-cdn.jtvnw.net/a.png", 10, 10)).toBe("https://static-cdn.jtvnw.net/a.png");
    expect(sizedImageUrl("", 10, 10)).toBeNull();
    expect(sizedImageUrl(undefined, 10, 10)).toBeNull();
  });
});

describe("formatLiveDuration：開台多久", () => {
  const now = new Date("2026-10-08T12:00:00Z");

  it("不到一分鐘_剛開台", () => {
    expect(formatLiveDuration("2026-10-08T11:59:30Z", now)).toBe("剛開台");
  });

  it("一小時內_幾分鐘", () => {
    expect(formatLiveDuration("2026-10-08T11:25:00Z", now)).toBe("開台 35 分鐘");
  });

  it("超過一小時_幾小時幾分_整點不寫分", () => {
    expect(formatLiveDuration("2026-10-08T09:55:00Z", now)).toBe("開台 2 小時 5 分");
    expect(formatLiveDuration("2026-10-08T09:00:00Z", now)).toBe("開台 3 小時");
  });

  it("超過一天也照小時算", () => {
    expect(formatLiveDuration("2026-10-07T10:00:00Z", now)).toBe("開台 26 小時");
  });

  it("開台時間比現在晚（時鐘誤差）_當作剛開台", () => {
    expect(formatLiveDuration("2026-10-08T12:00:20Z", now)).toBe("剛開台");
  });

  it("沒有或看不懂的時間_null", () => {
    expect(formatLiveDuration(null, now)).toBeNull();
    expect(formatLiveDuration("", now)).toBeNull();
    expect(formatLiveDuration("not-a-date", now)).toBeNull();
  });
});

describe("formatViewerCount：觀看人數", () => {
  it("千分位_加上「人觀看」", () => {
    expect(formatViewerCount(0)).toBe("0 人觀看");
    expect(formatViewerCount(987)).toBe("987 人觀看");
    expect(formatViewerCount(12345)).toBe("12,345 人觀看");
    expect(formatViewerCount(1234567)).toBe("1,234,567 人觀看");
  });

  it("沒有人數_null", () => {
    expect(formatViewerCount(null)).toBeNull();
  });
});

describe("Helix 回應整理成只留畫面用得到的欄位", () => {
  it("toProfile_頭像與離線橫幅_空字串當作沒有", () => {
    expect(toProfile({ id: "1", login: "alice", display_name: "Alice", profile_image_url: "https://p/1.png", offline_image_url: "" })).toEqual({
      id: "1",
      profileImageUrl: "https://p/1.png",
      offlineImageUrl: null,
    });
  });

  it("toLiveStream_標題、遊戲、人數、開台時間、預覽圖（換成 640x360）", () => {
    expect(
      toLiveStream({
        user_id: "1",
        title: "今天玩鐵道",
        game_id: "1234",
        game_name: "Honkai: Star Rail",
        viewer_count: 321,
        started_at: "2026-10-08T10:00:00Z",
        thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-{width}x{height}.jpg",
      }),
    ).toEqual({
      userId: "1",
      title: "今天玩鐵道",
      gameId: "1234",
      gameName: "Honkai: Star Rail",
      viewerCount: 321,
      startedAt: "2026-10-08T10:00:00Z",
      previewUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-640x360.jpg",
    });
  });

  it("toLiveStream_缺欄位給 null", () => {
    expect(toLiveStream({ user_id: "1", title: "", game_name: "", started_at: "" })).toEqual({
      userId: "1",
      title: null,
      gameId: null,
      gameName: null,
      viewerCount: null,
      startedAt: null,
      previewUrl: null,
    });
  });

  it("toGameArt_封面換成 72x96", () => {
    expect(toGameArt({ id: "1234", name: "Honkai: Star Rail", box_art_url: "https://static-cdn.jtvnw.net/ttv-boxart/1234-{width}x{height}.jpg" })).toEqual({
      id: "1234",
      boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/1234-72x96.jpg",
    });
  });
});

describe("mergeStreamerVisuals：資料庫的主播加上 Helix 的頭像、直播與封面", () => {
  const streamers = [
    { broadcasterId: "1", login: "alice", profileImageUrl: "https://db/alice.png", isLive: false },
    { broadcasterId: "2", login: "bob", profileImageUrl: null, isLive: true },
    { broadcasterId: "3", login: "carol", profileImageUrl: "https://db/carol.png", isLive: false },
  ];
  const profiles = [
    { id: "1", profileImageUrl: "https://helix/alice.png", offlineImageUrl: "https://helix/alice-offline.png" },
    { id: "2", profileImageUrl: "https://helix/bob.png", offlineImageUrl: null },
  ];
  const streams = [
    { userId: "1", title: "早安", gameId: "99", gameName: "Just Chatting", viewerCount: 50, startedAt: "2026-10-08T10:00:00Z", previewUrl: "https://helix/alice-640x360.jpg" },
  ];
  const games = [{ id: "99", boxArtUrl: "https://helix/99-72x96.jpg" }];

  it("Helix 查得到直播_直播中、帶直播資訊與遊戲封面；直播中的排前面", () => {
    const merged = mergeStreamerVisuals(streamers, { profiles, streams, games });

    expect(merged.map((s) => s.login)).toEqual(["alice", "bob", "carol"]);
    expect(merged[0]).toMatchObject({
      isLive: true,
      avatarUrl: "https://helix/alice.png",
      bannerUrl: "https://helix/alice-offline.png",
      live: { title: "早安", gameName: "Just Chatting", boxArtUrl: "https://helix/99-72x96.jpg", viewerCount: 50, previewUrl: "https://helix/alice-640x360.jpg" },
    });
  });

  it("EventSub 說開台但 Helix 還查不到（剛開台）_仍是直播中，直播資訊都是 null", () => {
    const [, bob] = mergeStreamerVisuals(streamers, { profiles, streams, games });

    expect(bob).toMatchObject({ login: "bob", isLive: true, live: { title: null, previewUrl: null, viewerCount: null } });
  });

  it("離線_沒有直播資訊；Helix 沒有這位主播的頭像時退回資料庫存的", () => {
    const carol = mergeStreamerVisuals(streamers, { profiles, streams, games }).find((s) => s.login === "carol");

    expect(carol).toMatchObject({ isLive: false, live: null, avatarUrl: "https://db/carol.png", bannerUrl: null });
  });

  it("排序：直播中在前，同組照帳號排序", () => {
    const merged = mergeStreamerVisuals(
      [
        { broadcasterId: "2", login: "bob", profileImageUrl: null, isLive: true },
        { broadcasterId: "3", login: "carol", profileImageUrl: null, isLive: false },
        { broadcasterId: "1", login: "alice", profileImageUrl: null, isLive: false },
      ],
      { profiles: null, streams: [{ ...streams[0], userId: "3" }], games: null },
    );

    expect(merged.map((s) => s.login)).toEqual(["bob", "carol", "alice"]);
  });

  it("Helix 不能用（沒設定憑證或出錯）_全部退回資料庫：頭像用存的、直播中照 EventSub", () => {
    const merged = mergeStreamerVisuals(streamers, { profiles: null, streams: null, games: null });

    expect(merged.map((s) => [s.login, s.isLive, s.avatarUrl, s.bannerUrl])).toEqual([
      ["bob", true, null, null],
      ["alice", false, "https://db/alice.png", null],
      ["carol", false, "https://db/carol.png", null],
    ]);
    expect(merged[0].live).toEqual({ title: null, gameName: null, boxArtUrl: null, viewerCount: null, startedAt: null, previewUrl: null });
  });

  it("保留資料庫的其他欄位", () => {
    const [first] = mergeStreamerVisuals([{ ...streamers[0], id: 7, displayName: "Alice" }], { profiles, streams: [], games: [] });

    expect(first).toMatchObject({ id: 7, displayName: "Alice", login: "alice" });
  });
});

describe("cacheKeyIds：快取 key 用的 id 清單", () => {
  it("去掉重複與空白、排序：同一組主播不論資料庫的順序都是同一份快取", () => {
    expect(cacheKeyIds(["3", "1", "", "3", "2"])).toEqual(["1", "2", "3"]);
    expect(cacheKeyIds([null, "1", undefined])).toEqual(["1"]);
  });
});

describe("pickLiveNow：首頁「正在直播」要列哪幾位", () => {
  const visual = (login: string, isLive: boolean) => ({ login, isLive });

  it("只列直播中的，順序照原本的清單（直播中在前、照帳號排）", () => {
    expect(pickLiveNow([visual("bob", true), visual("alice", false), visual("carol", true)])).toEqual({ shown: [visual("bob", true), visual("carol", true)], more: 0 });
  });

  it("超過上限_只列前幾位，其餘算進 more", () => {
    const live = ["a1", "a2", "a3", "a4", "a5", "a6"].map((login) => visual(login, true));

    const picked = pickLiveNow(live, 4);

    expect(picked.shown.map((s) => s.login)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(picked.more).toBe(2);
  });

  it("預設最多 4 位", () => {
    expect(pickLiveNow(Array.from({ length: 5 }, (_, i) => visual(`s${i}`, true))).shown).toHaveLength(4);
  });

  it("沒有人在直播_空清單", () => {
    expect(pickLiveNow([visual("alice", false)])).toEqual({ shown: [], more: 0 });
  });
});
