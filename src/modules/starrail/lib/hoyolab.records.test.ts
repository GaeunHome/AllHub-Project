import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";

const { fetchActCalendar, fetchEndgame, fetchLedger, fetchProfile } = await import("./hoyolab");

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42";
const ok = (data: unknown) => Response.json({ retcode: 0, message: "OK", data });
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const endpoint = (url: string) => `${new URL(url).origin}${new URL(url).pathname}`;
const cookiePairs = (header: unknown) => String(header).split(/;\s*/).sort();
const sentCookie = (hoyolab: ReturnType<typeof fakeFetch>) => (hoyolab.calls[0].init.headers as Record<string, string>).Cookie;

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchLedger：開拓月曆（srledger/month_info）", () => {
  it("帶 uid、region、month（YYYYMM）與語言", async () => {
    const hoyolab = fakeFetch(() => ok({ data_month: 202610, month_data: { current_hcoin: 100 } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchLedger(COOKIE, "900000001", "prod_official_cht", "202610");

    expect(endpoint(hoyolab.urls[0])).toBe("https://sg-public-api.hoyolab.com/event/srledger/month_info");
    expect(query(hoyolab.urls[0])).toEqual({ uid: "900000001", region: "prod_official_cht", month: "202610", lang: "zh-tw" });
    // 沒貼 account_id_v2 用 ltuid_v2 的值補上
    expect(cookiePairs(sentCookie(hoyolab))).toEqual(["account_id_v2=42", "ltoken_v2=v2_top_secret", "ltuid_v2=42"]);
    expect(result.ok && result.data.ledger.current.jade).toBe(100);
  });

  it("沒貼 account_id_v2、account_mid_v2_用 ltuid_v2、ltmid_v2 的值補上再送出；已經貼了的照原樣", async () => {
    const hoyolab = fakeFetch(() => ok({ data_month: 202610 }));
    vi.stubGlobal("fetch", hoyolab.impl);

    await fetchLedger(`${COOKIE}; ltmid_v2=mid_x; cookie_token_v2=v2_ct`, "900000001", "prod_official_cht", "202610");
    await fetchLedger(`${COOKIE}; ltmid_v2=mid_x; account_mid_v2=mid_y; cookie_token_v2=v2_ct`, "900000001", "prod_official_cht", "202610");

    const [filled, kept] = hoyolab.calls.map((call) => cookiePairs((call.init.headers as Record<string, string>).Cookie));
    expect(filled).toEqual(expect.arrayContaining(["account_id_v2=42", "account_mid_v2=mid_x", "cookie_token_v2=v2_ct"]));
    expect(kept).toContain("account_mid_v2=mid_y");
    expect(kept).not.toContain("account_mid_v2=mid_x");
  });

  const loginRequired = (retcode: number) => () => Response.json({ retcode, message: "请先登录", data: null });

  it.each([-100, 10001])("回 %i、cookie 沒有 cookie_token_v2_請重新貼上含 cookie_token_v2 與 account_mid_v2 的 cookie，不說整個 cookie 失效", async (retcode) => {
    vi.stubGlobal("fetch", fakeFetch(loginRequired(retcode)).impl);

    const result = await fetchLedger(`${COOKIE}; ltmid_v2=mid_x`, "900000001", "prod_official_cht", "202610");

    expect(result).toMatchObject({
      ok: false,
      retcode,
      cookieInvalid: false,
      message: "開拓月曆需要 cookie 裡的 cookie_token_v2 與 account_mid_v2：請用「新增帳號或更新 cookie」重新貼上包含這兩個欄位的 cookie",
    });
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });

  it("回 -100、有 cookie_token_v2 但沒有 account_mid_v2 也沒有 ltmid_v2 可以補_一樣請重新貼上含這兩個欄位的 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(loginRequired(-100)).impl);

    const result = await fetchLedger(`${COOKIE}; cookie_token_v2=v2_ct`, "900000001", "prod_official_cht", "202610");

    expect(!result.ok && result.message).toContain("cookie_token_v2 與 account_mid_v2");
    expect(result).toMatchObject({ cookieInvalid: false });
  });

  it("回 -100、欄位都在（account_mid_v2 由 ltmid_v2 補上也算）_說開拓月曆讀不到並附上代碼，請貼最新的 cookie，不說整個 cookie 失效", async () => {
    vi.stubGlobal("fetch", fakeFetch(loginRequired(-100)).impl);

    const result = await fetchLedger(`${COOKIE}; ltmid_v2=mid_x; cookie_token_v2=v2_ct`, "900000001", "prod_official_cht", "202610");

    expect(result).toMatchObject({ ok: false, cookieInvalid: false, message: "開拓月曆讀不到（-100：请先登录），請重新貼上最新的 cookie" });
    expect(JSON.stringify(result)).not.toContain("v2_ct");
  });

  it("其他錯誤_照原本的說明", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Response.json({ retcode: 10102, message: "Data is not public", data: null })).impl);

    const result = await fetchLedger(COOKIE, "900000001", "prod_official_cht", "202610");

    expect(!result.ok && result.message).toContain("資料沒有公開");
  });

  it("連線失敗_回失敗結果_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const result = await fetchLedger(COOKIE, "900000001", "prod_official_cht", "202610");

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });
});

describe("fetchEndgame：終局戰績", () => {
  it.each([
    ["chaos", "current", "challenge", "1"],
    ["chaos", "previous", "challenge", "2"],
    ["fiction", "current", "challenge_story", "1"],
    ["shadow", "previous", "challenge_boss", "2"],
  ] as const)("%s／%s_打 %s、schedule_type=%s、need_all、role_id、server，帶 DS", async (mode, schedule, path, type) => {
    const hoyolab = fakeFetch(() => ok({ has_data: false, all_floor_detail: [] }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchEndgame(COOKIE, "900000001", "prod_official_cht", mode, schedule);

    expect(endpoint(hoyolab.urls[0])).toBe(`https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/${path}`);
    expect(query(hoyolab.urls[0])).toEqual({ schedule_type: type, need_all: "true", role_id: "900000001", server: "prod_official_cht" });
    expect((hoyolab.calls[0].init.headers as Record<string, string>).ds).toMatch(/^\d+,[a-z0-9]{6},[0-9a-f]{32}$/);
    expect(result.ok && result.data.endgame).toMatchObject({ mode, hasData: false });
  });
});

describe("fetchProfile：戰績首頁（index）的遊戲頭像", () => {
  it("帶 role_id、server 與 DS；讀 cur_head_icon_url", async () => {
    const hoyolab = fakeFetch(() => ok({ stats: { active_days: 300 }, cur_head_icon_url: "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png" }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchProfile(COOKIE, "900000001", "prod_official_cht");

    expect(endpoint(hoyolab.urls[0])).toBe("https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/index");
    expect(query(hoyolab.urls[0])).toEqual({ role_id: "900000001", server: "prod_official_cht" });
    expect((hoyolab.calls[0].init.headers as Record<string, string>).ds).toMatch(/^\d+,[a-z0-9]{6},[0-9a-f]{32}$/);
    expect(result).toMatchObject({ ok: true, data: { avatar: "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png", missing: [] } });
  });

  it("連線失敗_回失敗結果_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const result = await fetchProfile(COOKIE, "900000001", "prod_official_cht");

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });
});

describe("fetchActCalendar：活動日曆（get_act_calender）", () => {
  it("照 genshin.py 帶 role_id、server 與 DS", async () => {
    const hoyolab = fakeFetch(() => ok({ cur_game_version: "3.7", challenge_list: [], act_list: [], avatar_card_pool_list: [], equip_card_pool_list: [] }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchActCalendar(COOKIE, "900000001", "prod_official_cht");

    expect(endpoint(hoyolab.urls[0])).toBe("https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/get_act_calender");
    expect(query(hoyolab.urls[0])).toEqual({ role_id: "900000001", server: "prod_official_cht" });
    expect((hoyolab.calls[0].init.headers as Record<string, string>).ds).toMatch(/^\d+,[a-z0-9]{6},[0-9a-f]{32}$/);
    expect(result).toMatchObject({ ok: true, data: { calendar: { version: "3.7" }, missing: [] } });
  });

  it("連線失敗_回失敗結果_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const result = await fetchActCalendar(COOKIE, "900000001", "prod_official_cht");

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });
});
