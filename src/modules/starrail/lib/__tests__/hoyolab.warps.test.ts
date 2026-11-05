import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { fetchWarpPage, warpLogin } from "../hoyolab";

const COOKIE = "ltuid_v2=1; ltoken_v2=t; ltmid_v2=m; cookie_token_v2=secret_token";
const UID = "900000001";
const REGION = "prod_official_cht";
const OK = { retcode: 0, message: "OK", data: null };
const EMPTY_PAGE = { retcode: 0, message: "OK", data: { version_id: 41, next_max_id: "", has_more: false, list: [] } };

function capture(body: unknown, setCookies: string[] = []) {
  const fake = fakeFetch(() => new Response(JSON.stringify(body), { headers: setCookies.map((value): [string, string] => ["Set-Cookie", value]) }));
  vi.stubGlobal("fetch", fake.impl);
  return fake;
}

const sentHeaders = (fake: ReturnType<typeof capture>) => fake.calls[0].init.headers as Record<string, string>;
const lowered = (headers: Record<string, string>) => Object.keys(headers).map((name) => name.toLowerCase());

describe("warpLogin：照真實帳號試成功的那一組", () => {
  it("POST sg-act-public-api 的 badge 登入，uid 是字串", async () => {
    const fake = capture(OK, ["e_hkrpg_token=badge; Path=/"]);

    await warpLogin(COOKIE, UID, REGION);

    expect(fake.urls[0]).toBe("https://sg-act-public-api.hoyolab.com/common/badge/v1/login/account");
    expect(fake.calls[0].init.method).toBe("POST");
    expect(fake.calls[0].body).toEqual({ game_biz: "hkrpg_global", lang: "zh-tw", region: REGION, uid: UID });
  });

  it("標頭：Content-Type 與語言照帶；x-rpc-device_id 會讓登入被拒絕，不能帶；也不用 DS", async () => {
    const fake = capture(OK, ["e_hkrpg_token=badge; Path=/"]);

    await warpLogin(COOKIE, UID, REGION);

    const headers = sentHeaders(fake);
    expect(headers).toMatchObject({ "Content-Type": "application/json", "x-rpc-lang": "zh-tw", "x-rpc-language": "zh-tw" });
    expect(headers["User-Agent"]).toBeTruthy();
    expect(lowered(headers)).not.toContain("x-rpc-device_id");
    expect(lowered(headers)).not.toContain("ds");
  });

  it("cookie 帶 cookie_token_v2；沒貼 account_ 開頭的鍵時用 lt 開頭的補上", async () => {
    const fake = capture(OK, ["e_hkrpg_token=badge; Path=/"]);

    await warpLogin(COOKIE, UID, REGION);

    const { Cookie } = sentHeaders(fake);
    expect(Cookie).toContain("cookie_token_v2=secret_token");
    expect(Cookie).toContain("account_id_v2=1");
    expect(Cookie).toContain("account_mid_v2=m");
  });

  it("回傳的 cookie 接上登入拿到的 Set-Cookie，後面的請求要帶它", async () => {
    capture(OK, ["e_hkrpg_token=badge; Path=/; HttpOnly", "SERVERID=s1; Path=/"]);

    const result = await warpLogin(COOKIE, UID, REGION);

    expect(result.ok && result.data).toContain("cookie_token_v2=secret_token");
    expect(result.ok && result.data).toMatch(/; e_hkrpg_token=badge; SERVERID=s1$/);
  });

  it("連不上_回失敗；訊息與 log 都不含 cookie", async () => {
    const log = captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const result = await warpLogin(COOKIE, UID, REGION);

    expect(result).toMatchObject({ ok: false, cookieInvalid: false });
    expect(JSON.stringify(result)).not.toContain("secret_token");
    expect(loggedText(log)).not.toContain("secret_token");
  });
});

describe("fetchWarpPage：讀一頁五星紀錄", () => {
  it("回應的游標是 19 位數字_下一頁要帶的值一位都不差", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new Response('{"retcode":0,"message":"OK","data":{"version_id":41,"next_max_id":1793851865218000123,"has_more":true,"list":[]}}')).impl);

    expect(await fetchWarpPage("c", "900", REGION, "GachaType_AvatarUp", null)).toMatchObject({ ok: true, data: { next: { maxId: "1793851865218000123" } } });
  });

  const SENT = `${COOKIE}; e_hkrpg_token=badge`;

  it("第一頁：GET five_star_list，參數是 game_biz、region、uid 與 gacha_type", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(SENT, UID, REGION, "GachaType_AvatarUp", null);

    const url = new URL(fake.urls[0]);
    expect(`${url.origin}${url.pathname}`).toBe("https://sg-act-public-api.hoyolab.com/event/rpg_gacha_record/five_star_list");
    expect(Object.fromEntries(url.searchParams)).toEqual({ game_biz: "hkrpg_global", region: REGION, uid: UID, gacha_type: "GachaType_AvatarUp" });
    expect(fake.calls[0].init.method ?? "GET").toBe("GET");
  });

  it("下一頁：多帶 version_id 與 max_id", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(SENT, UID, REGION, "GachaType_Standard", { versionId: "41", maxId: "9001" });

    expect(Object.fromEntries(new URL(fake.urls[0]).searchParams)).toMatchObject({ gacha_type: "GachaType_Standard", version_id: "41", max_id: "9001" });
  });

  it("標頭跟登入一樣，cookie 帶著登入拿到的 e_hkrpg_token，不帶 x-rpc-device_id 與 DS", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(SENT, UID, REGION, "GachaType_AvatarUp", null);

    const headers = sentHeaders(fake);
    expect(headers).toMatchObject({ Cookie: SENT, "x-rpc-lang": "zh-tw", "x-rpc-language": "zh-tw" });
    expect(lowered(headers)).not.toContain("x-rpc-device_id");
    expect(lowered(headers)).not.toContain("ds");
  });
});
