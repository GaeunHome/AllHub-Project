import { describe, expect, it } from "vitest";
import { interpretWarpPage, parseAuthkey, summarizeBanner, WARP_BANNERS, type Warp } from "./warps";

const item = (overrides: Record<string, unknown> = {}) => ({
  uid: "800000001",
  gacha_id: "2001",
  gacha_type: "11",
  item_id: "1102",
  count: "1",
  time: "2026-11-03 21:04:00",
  name: "希兒",
  lang: "zh-tw",
  item_type: "角色",
  rank_type: "5",
  id: "1762171440000000001",
  ...overrides,
});
const page = (list: unknown[], extra: Record<string, unknown> = {}) => ({ retcode: 0, message: "OK", data: { page: "1", size: "20", list, region: "prod_official_cht", region_time_zone: 8, ...extra } });

describe("interpretWarpPage：一頁躍遷紀錄", () => {
  it("欄位照 genshin.py 的 Warp；台港澳服 UTC+8 的 21:04 是 UTC 13:04", () => {
    const result = interpretWarpPage(page([item()]), 11);

    expect(result).toEqual({
      ok: true,
      data: {
        warps: [{ id: "1762171440000000001", bannerType: 11, gachaId: 2001, itemId: 1102, name: "希兒", itemType: "角色", rarity: 5, time: new Date("2026-11-03T13:04:00Z") }],
        missing: [],
      },
    });
  });

  it("時間照回應的時區算：美服 UTC-5 的 21:04 是隔天 UTC 02:04", () => {
    const result = interpretWarpPage(page([item()], { region_time_zone: -5 }), 11);

    expect(result.ok && result.data.warps[0].time).toEqual(new Date("2026-11-04T02:04:00Z"));
  });

  it("回應沒寫時區_當成 UTC+8", () => {
    const result = interpretWarpPage(page([item()], { region_time_zone: undefined }), 11);

    expect(result.ok && result.data.warps[0].time).toEqual(new Date("2026-11-03T13:04:00Z"));
  });

  it("id、名稱、稀有度或時間讀不到的一筆略過，記下少了什麼；其他筆照常", () => {
    const result = interpretWarpPage(page([item({ id: undefined }), item({ id: "2", rank_type: "x" }), item({ id: "3", time: "壞掉" }), item({ id: "4" })]), 11);

    expect(result.ok && result.data.warps.map((warp) => warp.id)).toEqual(["4"]);
    expect(result.ok && result.data.missing).toEqual(["list[].id", "list[].rank_type", "list[].time"]);
  });

  it("id 很長 不能轉成數字 會失去精度", () => {
    const result = interpretWarpPage(page([item({ id: "1762171440000000999" })]), 11);

    expect(result.ok && result.data.warps[0].id).toBe("1762171440000000999");
  });

  it("金鑰過期（-101）_回失敗", () => {
    expect(interpretWarpPage({ retcode: -101, message: "authkey timeout", data: null }, 11).ok).toBe(false);
  });
});

describe("parseAuthkey：用 cookie 換到的金鑰", () => {
  it("回應是網址編碼過的 要解開 送出時才不會編碼兩次（genshin.py 也先 unquote）", () => {
    expect(parseAuthkey({ authkey: "abc%2Bdef%3D%3D", authkey_ver: 1, sign_type: 2 })).toBe("abc+def==");
  });

  it("沒有金鑰_回 null", () => {
    expect(parseAuthkey({})).toBeNull();
    expect(parseAuthkey(null)).toBeNull();
  });
});

/** 由舊到新 數字是稀有度 */
const history = (...rarities: number[]): Warp[] =>
  rarities.map((rarity, i) => ({ id: String(i + 1), bannerType: 11, gachaId: 1, itemId: 1, name: rarity === 5 ? `五星${i + 1}` : `其他${i + 1}`, itemType: "角色", rarity, time: new Date(Date.UTC(2026, 0, i + 1)) }));
const repeat = (rarity: number, times: number) => Array.from({ length: times }, () => rarity);

describe("summarizeBanner：保底與五星歷史", () => {
  const banner = WARP_BANNERS.find(({ id }) => id === 11)!;

  it("已墊是最後一個五星之後的抽數，距離保底照這個卡池算（角色 90 抽）", () => {
    // 五星在第 3 抽 之後抽了 23 次
    const summary = summarizeBanner(banner, history(4, 3, 5, ...repeat(3, 23)));

    expect(summary).toMatchObject({ total: 26, pity: 23, pityKnown: true, remaining: 67 });
  });

  it("每個五星花幾抽：上一個五星之後算起，最舊的那個之前可能有更早的紀錄，標 partial；新的排前面", () => {
    // 3 抽出第一個 再 2 抽出第二個 再 4 抽出第三個
    const summary = summarizeBanner(banner, history(3, 3, 5, 3, 5, 3, 3, 3, 5));

    expect(summary.fiveStars.map((star) => [star.name, star.pulls, star.partial])).toEqual([
      ["五星9", 4, false],
      ["五星5", 2, false],
      ["五星3", 3, true],
    ]);
  });

  it("平均只算完整的（(4 + 2) ÷ 2 = 3），不算 partial 的", () => {
    expect(summarizeBanner(banner, history(3, 3, 5, 3, 5, 3, 3, 3, 5)).average).toBe(3);
  });

  it("平均四捨五入到整數（(3 + 4) ÷ 2 = 3.5 → 4）", () => {
    expect(summarizeBanner(banner, history(5, 3, 3, 5, 3, 3, 3, 5)).average).toBe(4);
  });

  it("紀錄裡沒有五星_已墊只是下限（pityKnown 是 false），也沒有平均", () => {
    expect(summarizeBanner(banner, history(3, 4, 3))).toMatchObject({ total: 3, pity: 3, pityKnown: false, average: null, fiveStars: [] });
  });

  it("只有一個五星_那個是 partial，沒有平均", () => {
    expect(summarizeBanner(banner, history(3, 5))).toMatchObject({ average: null, pity: 0, pityKnown: true });
  });

  it("剛出五星_已墊 0，距離保底整整 90", () => {
    expect(summarizeBanner(banner, history(5))).toMatchObject({ pity: 0, remaining: 90 });
  });

  it("光錐池 80 抽保底；新手池 50 抽", () => {
    expect(summarizeBanner(WARP_BANNERS.find(({ id }) => id === 12)!, history(5, 3, 3))).toMatchObject({ remaining: 78 });
    expect(summarizeBanner(WARP_BANNERS.find(({ id }) => id === 2)!, history(5, 3))).toMatchObject({ remaining: 49 });
  });

  it("抽數超過保底（資料有缺或活動規則不同）_距離保底是 0，不是負數", () => {
    expect(summarizeBanner(banner, history(5, ...repeat(3, 95)))).toMatchObject({ pity: 95, remaining: 0 });
  });

  it("空的卡池", () => {
    expect(summarizeBanner(banner, [])).toMatchObject({ total: 0, pity: 0, pityKnown: false, fiveStars: [], latest: null });
  });

  it("latest 是最新一抽的時間", () => {
    expect(summarizeBanner(banner, history(3, 3)).latest).toEqual(new Date(Date.UTC(2026, 0, 2)));
  });
});

describe("WARP_BANNERS", () => {
  it("genshin.py 的 StarRailBannerType：常駐 1、新手 2、角色 11、光錐 12、聯動 21 與 22", () => {
    expect(WARP_BANNERS.map((banner) => banner.id).toSorted((a, b) => a - b)).toEqual([1, 2, 11, 12, 21, 22]);
  });
});
