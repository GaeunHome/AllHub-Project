import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { fetchWarpAuthkey, fetchWarpPage } from "../hoyolab";

const COOKIE = "ltuid_v2=1; ltoken_v2=t; ltmid_v2=m; cookie_token_v2=x";
const KEY = "ab+c/d==";

function capture(body: unknown) {
  const fake = fakeFetch(() => Response.json(body));
  vi.stubGlobal("fetch", fake.impl);
  return fake;
}

const EMPTY_PAGE = { retcode: 0, message: "OK", data: { list: [], region_time_zone: 8 } };

describe("fetchWarpPage：照 genshin.py 的 request_gacha_info", () => {
  it("使用者遇過 -100：只帶金鑰不帶 cookie 兩種參數都被拒絕 genshin.py 讀紀錄時 cookie 一起送", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(COOKIE, KEY, 11, "0");

    const cookie = (fake.calls[0].init.headers as Record<string, string>).Cookie;
    expect(cookie).toContain("cookie_token_v2=x");
    expect(cookie).toContain("account_id_v2=1");
  });

  it("參數跟 genshin.py 一模一樣 不多帶別的 一次只驗證一件事", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(COOKIE, KEY, 11, "0");

    const query = new URL(fake.urls[0]).searchParams;
    expect(Object.fromEntries(query)).toEqual({ authkey_ver: "1", authkey: KEY, lang: "zh-tw", game_biz: "hkrpg_global", gacha_type: "11", real_gacha_type: "11", size: "20", end_id: "0" });
  });

  it("金鑰的 + / = 只編碼一次 伺服器解開後要跟原本一樣", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(COOKIE, KEY, 11, "0");

    expect(fake.urls[0]).toContain("authkey=ab%2Bc%2Fd%3D%3D");
  });

  it("聯動卡池走另一個路徑", async () => {
    const fake = capture(EMPTY_PAGE);

    await fetchWarpPage(COOKIE, KEY, 21, "0");

    expect(new URL(fake.urls[0]).pathname).toMatch(/\/getLdGachaLog$/);
  });
});

describe("fetchWarpAuthkey", () => {
  it("回傳解開編碼的金鑰", async () => {
    capture({ retcode: 0, message: "OK", data: { authkey: "k%2B", authkey_ver: 1, sign_type: 2 } });

    const result = await fetchWarpAuthkey("cookie_token_v2=x; ltuid_v2=1", "900000001", "prod_official_cht");

    expect(result).toEqual({ ok: true, data: "k+" });
  });
});
