import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { interpretPeak } from "../../lib/peak";
import { interpretWarpLogin, interpretWarpPage, summarizeBanner, WARP_BANNERS, type WarpRow } from "../../lib/warps";
import { handle } from "../mock.mjs";

const COOKIE = "ltoken_v2=t; ltuid_v2=1; cookie_token_v2=c";
const QUERY = "game_biz=hkrpg_global&region=prod_official_cht&uid=900000001";
const LOGIN = "/common/badge/v1/login/account";
const LIST = "/event/rpg_gacha_record/five_star_list";

const login = (cookie: string) => mockRequest(handle, LOGIN, { method: "POST", body: JSON.stringify({ game_biz: "hkrpg_global", lang: "zh-tw", region: "prod_official_cht", uid: "900000001" }), headers: { Cookie: cookie } });
const setCookiesOf = (reply: Awaited<ReturnType<typeof login>>) => [reply.headers["Set-Cookie"] ?? []].flat();
const signedIn = async () => {
  const reply = await login(COOKIE);
  const result = interpretWarpLogin(reply.data, COOKIE, setCookiesOf(reply));
  if (!result.ok) throw new Error(result.message);
  return result.data;
};

/** 跟網站一樣一頁接一頁讀 回應用正式的解析讀得懂才算形狀對 */
async function readBanner(gachaType: string) {
  const cookie = await signedIn();
  const rows: WarpRow[] = [];
  let cursor = "";
  let pages = 0;
  for (;;) {
    const reply = await mockRequest(handle, `${LIST}?${QUERY}&gacha_type=${gachaType}${cursor}`, { headers: { Cookie: cookie } });
    const page = interpretWarpPage(reply.data);
    if (!page.ok) throw new Error(page.message);
    expect(page.data.missing).toEqual([]);
    rows.push(...page.data.rows);
    pages += 1;
    if (!page.data.next) return { rows, pages };
    cursor = `&version_id=${page.data.next.versionId}&max_id=${page.data.next.maxId}`;
  }
}

describe("假的躍遷紀錄：跟真的介面一樣", () => {
  it("登入：回 Set-Cookie 的六個鍵，只取分號前面就能用", async () => {
    const reply = await login(COOKIE);

    expect(setCookiesOf(reply).map((line) => line.split("=")[0])).toEqual(["e_hkrpg_token", "e_lrsag", "SERVERID", "SERVERCORSID", "acw_tc", "cdn_sec_tc"]);
    expect(reply.data).toMatchObject({ retcode: 0 });
  });

  it("沒有 cookie_token_v2 或它過期_登入回 -100", async () => {
    expect((await login("ltoken_v2=t; ltuid_v2=1")).data).toMatchObject({ retcode: -100 });
    expect((await login(`${COOKIE}expired`.replace("cookie_token_v2=c", "cookie_token_v2=expired"))).data).toMatchObject({ retcode: -100 });
  });

  it("沒登入就讀清單_回 -100 请从游戏内打开参与活动", async () => {
    const reply = await mockRequest(handle, `${LIST}?${QUERY}&gacha_type=GachaType_AvatarUp`, { headers: { Cookie: COOKIE } });

    expect(reply.data).toEqual({ retcode: -100, message: "请从游戏内打开参与活动", data: null });
  });

  it("每一列都有真實的欄位，data 有 version_id、next_max_id、has_more、list", async () => {
    const reply = await mockRequest(handle, `${LIST}?${QUERY}&gacha_type=GachaType_AvatarUp`, { headers: { Cookie: await signedIn() } });
    const data = (reply.data as { data: { list: Record<string, unknown>[] } }).data;

    expect(Object.keys(data).toSorted()).toEqual(["has_more", "list", "next_max_id", "version_id"]);
    for (const row of data.list) expect(Object.keys(row)).toEqual(expect.arrayContaining(["is_up", "got_item", "gacha_count", "uuid", "id"]));
    const stars = data.list.filter((row) => row.got_item);
    for (const row of stars) expect(Object.keys(row.item as object).toSorted()).toEqual(["big_icon", "icon", "item_id", "item_type", "name", "rarity"]);
  });

  it("角色活動要翻頁，翻完算得出已墊、平均與歪", async () => {
    const { rows, pages } = await readBanner("GachaType_AvatarUp");
    const summary = summarizeBanner(WARP_BANNERS.find(({ id }) => id === 11)!, rows);

    expect(pages).toBeGreaterThan(1);
    expect(summary.pity).toBeGreaterThan(0);
    expect(summary.fiveStars.some((star) => star.lost)).toBe(true);
    expect(summary.fiveStars.some((star) => !star.lost)).toBe(true);
  });

  it("常駐全部 is_up 都是 false，跟真實帳號一樣，畫面不能標歪", async () => {
    const { rows } = await readBanner("GachaType_Standard");
    const summary = summarizeBanner(WARP_BANNERS.find(({ id }) => id === 1)!, rows);

    expect(rows.flatMap(({ star }) => (star ? [star.isUp] : [])).every((isUp) => isUp === false)).toBe(true);
    expect(summary.fiveStars.length).toBeGreaterThan(0);
    expect(summary.fiveStars.some((star) => star.lost)).toBe(false);
  });

  it("沒抽過的卡池是空的清單", async () => {
    expect((await readBanner("GachaType_CollabAvatarUp")).rows).toEqual([]);
  });
});

describe("假的異相仲裁：跟 genshin.py 整理的格式一樣", () => {
  const peak = async (roleId = "900000001") => interpretPeak((await mockRequest(handle, `/game_record/hkrpg/api/challenge_peak?schedule_type=3&role_id=${roleId}&server=prod_official_cht`, { headers: { Cookie: COOKIE } })).data);

  it("一次回三期，正式的解析讀得懂、沒有缺欄位；本期打完了，王棋是高難度、有增益與評級勳章，三個騎士都有紀錄", async () => {
    const result = await peak();
    if (!result.ok) throw new Error(result.message);

    expect(result.data.missing).toEqual([]);
    expect(result.data.peak.seasons).toHaveLength(3);
    const [current] = result.data.peak.seasons;
    expect(current.boss).toMatchObject({ cleared: true, hardMode: true });
    expect(current.boss.buff?.name).toBeTruthy();
    expect(current.boss.medal).toBeTruthy();
    expect(current.knights.map((k) => k.cleared)).toEqual([true, true, true]);
  });

  it("上上期沒打（has_challenge_record 是 false）", async () => {
    const result = await peak();
    if (!result.ok) throw new Error(result.message);

    expect(result.data.peak.seasons[2].hasData).toBe(false);
  });

  it("亞服小號從來沒打過_沒有任何一期", async () => {
    const result = await peak("800000002");
    if (!result.ok) throw new Error(result.message);

    expect(result.data.peak.seasons).toEqual([]);
  });
});
