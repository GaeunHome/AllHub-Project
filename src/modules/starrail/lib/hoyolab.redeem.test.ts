import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";

const { redeemCode } = await import("./hoyolab");

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42; cookie_token_v2=ct_secret; account_id_v2=42";

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("redeemCode：兌換碼（webExchangeCdkeyRisk）", () => {
  it("POST JSON：cdkey、game_biz、region、uid、語言、平台、時間與裝置 id；Origin 是官方兌換頁", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: { msg: "兌換成功" } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const outcome = await redeemCode(COOKIE, "900000001", "prod_official_cht", "STARRAILGIFT");

    const [call] = hoyolab.calls;
    expect(call.url).toBe("https://public-operation-hkrpg.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk");
    expect(call.init.method).toBe("POST");
    expect(call.body).toMatchObject({ cdkey: "STARRAILGIFT", game_biz: "hkrpg_global", region: "prod_official_cht", uid: "900000001", lang: "zh-tw", platform: "4" });
    expect(call.body.t).toEqual(expect.any(Number));
    expect(call.body.device_uuid).toMatch(/^[0-9a-f-]{36}$/);
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Cookie).toBe(COOKIE);
    expect(headers.Origin).toBe("https://hsr.hoyoverse.com");
    expect(headers.Referer).toBe("https://hsr.hoyoverse.com/");
    expect(outcome).toMatchObject({ ok: true, retcode: 0 });
  });

  it("連線失敗_回失敗結果_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const outcome = await redeemCode(COOKIE, "900000001", "prod_official_cht", "STARRAILGIFT");

    expect(outcome).toMatchObject({ ok: false, retcode: null });
    expect(JSON.stringify(outcome)).not.toContain("secret");
  });
});
