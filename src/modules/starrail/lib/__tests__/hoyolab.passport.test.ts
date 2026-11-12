import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";

const { appLogin, fetchDailyNote, tokensFromStoken, verifyEmailCode } = await import("../hoyolab");

const headersOf = (call: { init: RequestInit }) => call.init.headers as Record<string, string>;
const VERIFY = JSON.stringify({ risk_ticket: "rt-1", verify_str: JSON.stringify({ ticket: "ticket-1", verify_type: "email" }) });

describe("送給一般介面的 cookie 不帶 stoken", () => {
  it("即時便箋這類戰績的請求：stoken 拿掉，其他鍵照送", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: {} }));
    vi.stubGlobal("fetch", hoyolab.impl);

    await fetchDailyNote("ltoken_v2=v2_lt; ltuid_v2=42; ltmid_v2=m; stoken=v2_secret_stoken", "900000001", "prod_official_cht");

    expect(headersOf(hoyolab.calls[0]).Cookie).toBe("ltoken_v2=v2_lt; ltuid_v2=42; ltmid_v2=m");
  });
});

describe("appLogin：HoYoLAB App 的帳號密碼登入", () => {
  const login = { account: "me@example.com", password: "p@ssw0rd!", deviceId: "device12345abcde" };

  it("POST 到 App 的登入介面；帳號密碼加密後才送（請求裡沒有原文），帶 App 的標頭、device id 與 DS", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: { token: { token: "v2_stoken" }, user_info: { aid: "123", mid: "mid-1" } } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await appLogin(login);

    const [call] = hoyolab.calls;
    expect(call.url).toBe("https://sg-public-api.hoyoverse.com/account/ma-passport/api/appLoginByPassword");
    expect(call.init.method).toBe("POST");
    expect(JSON.stringify(call.init)).not.toContain("me@example.com");
    expect(JSON.stringify(call.init)).not.toContain("p@ssw0rd!");
    expect(Object.keys(call.body as object)).toEqual(["account", "password"]);
    expect(headersOf(call)).toMatchObject({ "x-rpc-app_id": "c9oqaq3s3gu8", "x-rpc-client_type": "2", "x-rpc-aigis_v4": "true", "x-rpc-device_id": "device12345abcde" });
    expect(headersOf(call).ds).toMatch(/^\d+,\w{6},[0-9a-f]{32}$/);
    expect(result).toEqual({ kind: "ok", stoken: "v2_stoken", mid: "mid-1", aid: "123" });
  });

  it("圖形驗證或 email 驗證完再登入：帶著 x-rpc-aigis 或 x-rpc-verify", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: { token: { token: "v2_stoken" }, user_info: { aid: "123", mid: "mid-1" } } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    await appLogin({ ...login, aigis: "session-1;eyJ9" });
    await appLogin({ ...login, verify: VERIFY });

    expect(headersOf(hoyolab.calls[0])["x-rpc-aigis"]).toBe("session-1;eyJ9");
    expect(headersOf(hoyolab.calls[1])["x-rpc-verify"]).toBe(VERIFY);
  });

  it("要 email 驗證時從回應的標頭讀出 x-rpc-verify", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Response.json({ retcode: -3239, message: "", data: null }, { headers: { "x-rpc-verify": VERIFY } })).impl);

    expect(await appLogin(login)).toEqual({ kind: "email", verify: VERIFY });
  });
});

describe("verifyEmailCode：email 驗證碼", () => {
  it("帶 ticket 與驗證碼，照 genshin.py 的 verify_for_component", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: null }));
    vi.stubGlobal("fetch", hoyolab.impl);

    expect(await verifyEmailCode("ticket-1", "123456")).toEqual({ ok: true });
    expect(hoyolab.urls[0]).toBe("https://sg-public-api.hoyoverse.com/account/ma-verifier/api/verifyActionTicketPartly");
    expect(hoyolab.calls[0].body).toEqual({ action_type: "verify_for_component", action_ticket: "ticket-1", email_captcha: "123456", verify_method: 2 });
  });
});

describe("tokensFromStoken：用 stoken 換新 ltoken_v2 與 cookie_token_v2", () => {
  it("cookie 只帶 stoken 與 mid，要兩種 token（2 與 4）", async () => {
    const hoyolab = fakeFetch(() => Response.json({ retcode: 0, message: "OK", data: { tokens: [{ token_type: 2, token: "v2_lt" }, { token_type: 4, token: "v2_ct" }] } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    expect(await tokensFromStoken("v2_stoken", "mid-1")).toEqual({ ok: true, ltoken: "v2_lt", cookieToken: "v2_ct" });
    expect(hoyolab.urls[0]).toBe("https://sg-public-api.hoyoverse.com/account/ma-passport/token/getBySToken");
    expect(headersOf(hoyolab.calls[0])).toMatchObject({ Cookie: "stoken=v2_stoken; mid=mid-1", "x-rpc-app_id": "c9oqaq3s3gu8" });
    expect(hoyolab.calls[0].body).toEqual({ dst_token_types: [2, 4] });
  });
});
