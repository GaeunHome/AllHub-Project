import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { fetchWarpAuthkey, fetchWarpPage } from "./hoyolab";

const KEY = { authkey: "ab+c/d==", authkeyVer: "1", signType: "2", region: "prod_official_cht" };

function capture(body: unknown) {
  const fake = fakeFetch(() => Response.json(body));
  vi.stubGlobal("fetch", fake.impl);
  return fake.urls;
}

const EMPTY_PAGE = { retcode: 0, message: "OK", data: { list: [], region_time_zone: 8 } };

describe("fetchWarpPage：跟遊戲打開的抽卡網址帶一樣的參數", () => {
  it("金鑰的版本 簽章方式 用途與伺服器都帶上（遊戲開的網址與其他工具都有）", async () => {
    const urls = capture(EMPTY_PAGE);

    await fetchWarpPage(KEY, 11, "0");

    const query = new URL(urls[0]).searchParams;
    expect(query.get("authkey_ver")).toBe("1");
    expect(query.get("sign_type")).toBe("2");
    expect(query.get("auth_appid")).toBe("webview_gacha");
    expect(query.get("region")).toBe("prod_official_cht");
    expect(query.get("game_biz")).toBe("hkrpg_global");
  });

  it("金鑰的 + / = 只編碼一次 伺服器解開後要跟原本一樣", async () => {
    const urls = capture(EMPTY_PAGE);

    await fetchWarpPage(KEY, 11, "0");

    expect(urls[0]).toContain("authkey=ab%2Bc%2Fd%3D%3D");
    expect(new URL(urls[0]).searchParams.get("authkey")).toBe("ab+c/d==");
  });

  it("聯動卡池走另一個路徑 參數一樣", async () => {
    const urls = capture(EMPTY_PAGE);

    await fetchWarpPage(KEY, 21, "0");

    expect(new URL(urls[0]).pathname).toMatch(/\/getLdGachaLog$/);
    expect(new URL(urls[0]).searchParams.get("sign_type")).toBe("2");
  });
});

describe("fetchWarpAuthkey", () => {
  it("回傳的金鑰帶著這個帳號的伺服器 之後讀紀錄要用", async () => {
    capture({ retcode: 0, message: "OK", data: { authkey: "k", authkey_ver: 1, sign_type: 2 } });

    const result = await fetchWarpAuthkey("cookie_token_v2=x; ltuid_v2=1", "900000001", "prod_official_cht");

    expect(result).toEqual({ ok: true, data: { authkey: "k", authkeyVer: "1", signType: "2", region: "prod_official_cht" } });
  });
});
