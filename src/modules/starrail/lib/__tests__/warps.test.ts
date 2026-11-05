import { describe, expect, it } from "vitest";
import { WARP_BANNERS, interpretWarpLogin, interpretWarpPage, quoteBigCursors, summarizeBanner, type WarpRow } from "../warps";

// 欄位與數字來自真實帳號的回應 角色活動是真珠 77 瓦爾特 76（歪）知更鳥•晴歌 78
const item = (name: string) => ({ item_id: 1310, name, icon: "https://example.com/icon.png", item_type: "角色", rarity: 5, big_icon: "https://example.com/big.png" });
const star = (name: string, count: number, isUp = true, overrides: Record<string, unknown> = {}) => ({ item: item(name), is_up: isUp, got_item: true, gacha_count: count, uuid: `uuid-${name}`, id: 101, ...overrides });
const pityRow = (count: number) => ({ is_up: false, got_item: false, gacha_count: count, uuid: "", id: 0 });
const page = (list: unknown[], extra: Record<string, unknown> = {}) => ({ retcode: 0, message: "OK", data: { version_id: 41, next_max_id: "", has_more: false, list, ...extra } });

describe("interpretWarpPage：官方活動頁的一頁", () => {
  it("got_item 是 true 的是五星：名稱在 item.name，gacha_count 是花了幾抽，is_up 是有沒有抽到 UP", () => {
    const result = interpretWarpPage(page([star("真珠", 77), star("瓦爾特", 76, false)]));

    expect(result).toEqual({
      ok: true,
      data: {
        rows: [
          { pulls: 77, star: { name: "真珠", isUp: true } },
          { pulls: 76, star: { name: "瓦爾特", isUp: false } },
        ],
        next: null, incomplete: false,
        missing: [],
      },
    });
  });

  it("got_item 是 false 的那一列是目前已墊幾抽，沒有 item 也不算格式不對", () => {
    const result = interpretWarpPage(page([pityRow(23), star("真珠", 77)]));

    expect(result.ok && result.data.rows[0]).toEqual({ pulls: 23, star: null });
    expect(result.ok && result.data.missing).toEqual([]);
  });

  it("has_more 時下一頁要帶 version_id 與 next_max_id", () => {
    const result = interpretWarpPage(page([star("真珠", 77)], { has_more: true, version_id: 41, next_max_id: "9001" }));

    expect(result.ok && result.data.next).toEqual({ versionId: "41", maxId: "9001" });
  });

  it("游標是數字也收（genshin.py 的 version_id 是 int）", () => {
    const result = interpretWarpPage(page([star("真珠", 77)], { has_more: true, version_id: 41, next_max_id: 9001 }));

    expect(result.ok && result.data.next).toEqual({ versionId: "41", maxId: "9001" });
  });

  it("has_more 卻沒有游標_記下少了哪個欄位", () => {
    const result = interpretWarpPage(page([star("真珠", 77)], { has_more: true, next_max_id: null }));

    expect(result.ok && result.data.next).toBeNull();
    expect(result.ok && result.data.missing).toEqual(["next_max_id"]);
  });

  it("游標超過 number 能精確表示的範圍_JSON 解開時已經不準，不能拿來問下一頁", () => {
    const result = interpretWarpPage(JSON.parse('{"retcode":0,"data":{"version_id":41,"next_max_id":9007199254740993,"has_more":true,"list":[]}}'));

    expect(result.ok && result.data.next).toBeNull();
    expect(result.ok && result.data.missing).toEqual(["next_max_id"]);
  });

  it("少了必要欄位的一筆略過，記下欄位名稱；其他筆照常", () => {
    const result = interpretWarpPage(page([star("真珠", 77, true, { gacha_count: undefined }), star("x", 1, true, { item: {} }), { gacha_count: 3 }, star("瓦爾特", 76, false)]));

    expect(result.ok && result.data.rows).toEqual([{ pulls: 76, star: { name: "瓦爾特", isUp: false } }]);
    expect(result.ok && result.data.missing).toEqual(["list[].gacha_count", "list[].got_item", "list[].item.name"]);
  });

  it("is_up 讀不到_五星照樣留著，只是不知道有沒有歪", () => {
    const result = interpretWarpPage(page([star("真珠", 77, true, { is_up: undefined })]));

    expect(result.ok && result.data.rows).toEqual([{ pulls: 77, star: { name: "真珠", isUp: null } }]);
    expect(result.ok && result.data.missing).toEqual(["list[].is_up"]);
  });

  it("list 不是陣列_當成空的，記下欄位", () => {
    const result = interpretWarpPage({ retcode: 0, message: "OK", data: null });

    expect(result).toEqual({ ok: true, data: { rows: [], next: null, incomplete: true, missing: ["has_more", "list"] } });
  });

  it("真實回應：沒有登入資料時回 -100 请从游戏内打开参与活动_說 cookie_token_v2 過期", () => {
    const result = interpretWarpPage({ retcode: -100, message: "请从游戏内打开参与活动", data: null });

    expect(result).toMatchObject({ ok: false, retcode: -100, cookieInvalid: true });
    expect(!result.ok && result.message).toContain("cookie_token_v2");
    expect(!result.ok && result.message).toContain("重新貼上");
  });
});

describe("interpretWarpLogin：登入官方活動頁", () => {
  const COOKIE = "ltoken_v2=t; ltuid_v2=1; cookie_token_v2=c";
  const OK = { retcode: 0, message: "OK", data: null };
  const SET_COOKIES = [
    "e_hkrpg_token=badge; Path=/; Domain=.hoyolab.com; Max-Age=172800; HttpOnly; Secure",
    "e_lrsag=risk; Path=/",
    "SERVERID=s1; Path=/",
    "SERVERCORSID=s2; Path=/; SameSite=None",
    "acw_tc=a; Path=/; HttpOnly",
    "cdn_sec_tc=b; Path=/",
  ];

  it("真實回應的六個 Set-Cookie 都只取分號前面，接在原本的 cookie 後面", () => {
    expect(interpretWarpLogin(OK, COOKIE, SET_COOKIES)).toEqual({ ok: true, data: `${COOKIE}; e_hkrpg_token=badge; e_lrsag=risk; SERVERID=s1; SERVERCORSID=s2; acw_tc=a; cdn_sec_tc=b` });
  });

  it("登入被拒絕（-100）_是 cookie_token_v2 過期，要重貼；不是籠統的錯誤", () => {
    const result = interpretWarpLogin({ retcode: -100, message: "Please login", data: null }, COOKIE, []);

    expect(result).toMatchObject({ ok: false, cookieInvalid: true });
    expect(!result.ok && result.message).toContain("cookie_token_v2");
    expect(!result.ok && result.message).toContain("重新貼上");
  });

  it.each([
    ["查詢太頻繁", { retcode: -110, message: "visit too frequently", data: null }],
    ["連不上", { localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" }],
    ["回的不是 JSON", null],
  ])("%s_不是 cookie 的問題，不能叫使用者重貼", (_name, json) => {
    const result = interpretWarpLogin(json, COOKIE, []);

    expect(result).toMatchObject({ ok: false, cookieInvalid: false });
    expect(!result.ok && result.message).not.toContain("cookie_token_v2");
  });

  it("回應成功卻沒有 e_hkrpg_token_接著讀只會回 -100，這裡先說清楚，不怪 cookie", () => {
    const result = interpretWarpLogin(OK, COOKIE, ["acw_tc=a; Path=/"]);

    expect(result).toMatchObject({ ok: false, cookieInvalid: false });
  });
});

describe("summarizeBanner：保底與五星", () => {
  const bannerOf = (id: number) => WARP_BANNERS.find((banner) => banner.id === id)!;
  const rows = (...values: [string, number, boolean?][]): WarpRow[] => values.map(([name, pulls, isUp = true]) => ({ pulls, star: { name, isUp } }));
  const pity = (pulls: number): WarpRow => ({ pulls, star: null });

  it("真實樣本：已墊 23、距離保底 67、平均 (77 + 76 + 78) ÷ 3 = 77，新的在前", () => {
    const summary = summarizeBanner(bannerOf(11), [pity(23), ...rows(["真珠", 77], ["瓦爾特", 76, false], ["知更鳥•晴歌", 78])]);

    expect(summary).toMatchObject({ pity: 23, remaining: 67, average: 77 });
    expect(summary.fiveStars).toEqual([
      { name: "真珠", pulls: 77, lost: false },
      { name: "瓦爾特", pulls: 76, lost: true },
      { name: "知更鳥•晴歌", pulls: 78, lost: false },
    ]);
  });

  it.each([11, 12, 21, 22])("限定卡池 %i：is_up 是 false 算歪", (id) => {
    expect(summarizeBanner(bannerOf(id), rows(["瓦爾特", 76, false])).fiveStars[0].lost).toBe(true);
  });

  it.each([1, 2])("真實回應的常駐全部 is_up 都是 false：卡池 %i 不能標歪", (id) => {
    expect(summarizeBanner(bannerOf(id), rows(["瓦爾特", 76, false], ["布洛妮婭", 80, false])).fiveStars.map((star) => star.lost)).toEqual([false, false]);
  });

  it("is_up 讀不到_不標歪", () => {
    expect(summarizeBanner(bannerOf(11), [{ pulls: 76, star: { name: "瓦爾特", isUp: null } }]).fiveStars[0].lost).toBe(false);
  });

  it("平均四捨五入到整數（(3 + 4) ÷ 2 = 3.5 → 4）", () => {
    expect(summarizeBanner(bannerOf(11), rows(["a", 3], ["b", 4])).average).toBe(4);
  });

  it("沒有五星_沒有平均，已墊照官方的數字", () => {
    expect(summarizeBanner(bannerOf(11), [pity(40)])).toMatchObject({ pity: 40, remaining: 50, average: null, fiveStars: [] });
  });

  it("剛出五星、沒有已墊的那一列_已墊 0，距離保底整整 90", () => {
    expect(summarizeBanner(bannerOf(11), rows(["真珠", 77]))).toMatchObject({ pity: 0, remaining: 90 });
  });

  it("光錐池 80 抽保底；新手池 50 抽；聯動照同類型", () => {
    expect(summarizeBanner(bannerOf(12), [pity(2)]).remaining).toBe(78);
    expect(summarizeBanner(bannerOf(2), [pity(1)]).remaining).toBe(49);
    expect(summarizeBanner(bannerOf(21), [pity(1)]).remaining).toBe(89);
    expect(summarizeBanner(bannerOf(22), [pity(1)]).remaining).toBe(79);
  });

  it("已墊超過保底（活動規則不同）_距離保底是 0，不是負數", () => {
    expect(summarizeBanner(bannerOf(11), [pity(95)])).toMatchObject({ pity: 95, remaining: 0 });
  });

  it("沒抽過的卡池", () => {
    expect(summarizeBanner(bannerOf(11), [])).toMatchObject({ pity: 0, remaining: 90, average: null, fiveStars: [] });
  });
});

describe("WARP_BANNERS", () => {
  it("真實介面的 gacha_type：角色 AvatarUp、光錐 EquipmentUp、常駐 Standard、新手 Newbie、聯動 CollabAvatarUp 與 CollabEquipmentUp", () => {
    expect(Object.fromEntries(WARP_BANNERS.map((banner) => [banner.id, banner.gachaType]))).toEqual({
      11: "GachaType_AvatarUp",
      12: "GachaType_EquipmentUp",
      1: "GachaType_Standard",
      2: "GachaType_Newbie",
      21: "GachaType_CollabAvatarUp",
      22: "GachaType_CollabEquipmentUp",
    });
  });
});

describe("讀不完整不能當成讀完了", () => {
  it("has_more 卻沒有游標_標成沒讀完", () => {
    const result = interpretWarpPage(page([star("真珠", 77)], { has_more: true, next_max_id: null }));

    expect(result).toMatchObject({ ok: true, data: { incomplete: true, next: null } });
  });

  it("少了 has_more_不知道還有沒有下一頁，標成沒讀完", () => {
    expect(interpretWarpPage({ retcode: 0, message: "OK", data: { version_id: 41, list: [star("真珠", 77)] } })).toMatchObject({ ok: true, data: { incomplete: true } });
  });

  it("沒有下一頁_讀完了", () => {
    expect(interpretWarpPage(page([star("真珠", 77)]))).toMatchObject({ ok: true, data: { incomplete: false, next: null } });
  });
});

describe("quoteBigCursors：19 位數的游標 JSON 解開就不準了", () => {
  it("數字寫成字串，一位都不差", () => {
    const body = '{"retcode":0,"message":"OK","data":{"version_id":41,"next_max_id":1793851865218000123,"has_more":true,"list":[]}}';

    expect(interpretWarpPage(JSON.parse(quoteBigCursors(body)))).toMatchObject({ ok: true, data: { next: { versionId: "41", maxId: "1793851865218000123" } } });
  });

  it("本來就是字串_不動", () => {
    const body = '{"next_max_id":"1793851865218000123"}';

    expect(quoteBigCursors(body)).toBe(body);
  });
});
