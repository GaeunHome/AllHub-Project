import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aigisHeader, appLoginDs, encryptCredential, interpretAppLogin, interpretEmailVerify, interpretTokens, passportDs, verifyTicketOf } from "../passport";

// 規格照 genshin.py 的 utility/ds.py auth.py 與 auth 的 subclients/app.py
const SALT = "IZPgfb0dRPtBeLuFkdDznSZ6f4wWt6y2";
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const NOW = Date.UTC(2026, 10, 12, 4, 0, 0);
const T = Math.floor(NOW / 1000);
const headerOf = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;
const VERIFY = JSON.stringify({ risk_ticket: "rt-1", verify_str: JSON.stringify({ ticket: "ticket-1", verify_type: "email" }) });

describe("DS（App 登入與用 stoken 換新）", () => {
  it("App 登入的 DS：時間、亂數與 md5(salt、t、r、緊湊的 JSON body、空的 q)", () => {
    const body = { account: "enc-a", password: "enc-p" };

    expect(appLoginDs(body, NOW, () => "Ab3dE9")).toBe(`${T},Ab3dE9,${md5(`salt=${SALT}&t=${T}&r=Ab3dE9&b={"account":"enc-a","password":"enc-p"}&q=`)}`);
  });

  it("換新的 DS：時間、亂數與 md5(salt、t、r)", () => {
    expect(passportDs(NOW, () => "abcdef")).toBe(`${T},abcdef,${md5(`salt=${SALT}&t=${T}&r=abcdef`)}`);
  });
});

describe("encryptCredential（帳號密碼用 HoYoverse 的 RSA 公鑰加密）", () => {
  it("2048 位元的金鑰加密後是 256 bytes 的 base64；每次加密都不一樣（PKCS#1 的隨機填充），不含原文", () => {
    const first = encryptCredential("secret-password");
    const second = encryptCredential("secret-password");

    expect(Buffer.from(first, "base64")).toHaveLength(256);
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-password");
  });
});

describe("interpretAppLogin（App 登入的回應）", () => {
  it("成功：拿到 stoken、mid 與帳號 id（aid）", () => {
    const json = { retcode: 0, message: "OK", data: { token: { token_type: 1, token: "v2_stoken" }, user_info: { aid: "123456", mid: "mid-1" } } };

    expect(interpretAppLogin(json, headerOf({}))).toEqual({ kind: "ok", stoken: "v2_stoken", mid: "mid-1", aid: "123456" });
  });

  it("要圖形驗證（-3101）：從 x-rpc-aigis 取出 session、captcha id 與種類（data 是字串時先解開）", () => {
    const aigis = JSON.stringify({ session_id: "session-1", mmt_type: 1, data: JSON.stringify({ success: 1, gt: "captcha-1", risk_type: "slide", use_v4: true }) });

    expect(interpretAppLogin({ retcode: -3101, message: "", data: null }, headerOf({ "x-rpc-aigis": aigis }))).toEqual({
      kind: "captcha",
      captcha: { sessionId: "session-1", captchaId: "captcha-1", riskType: "slide" },
    });
  });

  it("要舊版（v3）的圖形驗證：不支援，請改貼 cookie", () => {
    const aigis = JSON.stringify({ session_id: "session-1", mmt_type: 1, data: { success: 1, gt: "gt-3", challenge: "c", new_captcha: 1 } });

    expect(interpretAppLogin({ retcode: -3101, message: "", data: null }, headerOf({ "x-rpc-aigis": aigis }))).toMatchObject({ kind: "error", message: expect.stringContaining("貼上 cookie") });
  });

  it("要 email 驗證（-3239）：原樣留著 x-rpc-verify，驗證完再帶回去登入", () => {
    expect(interpretAppLogin({ retcode: -3239, message: "", data: null }, headerOf({ "x-rpc-verify": VERIFY }))).toEqual({ kind: "email", verify: VERIFY });
  });

  it.each([
    [-3208, "帳號或密碼錯誤"],
    [-3004, "帳號或密碼錯誤"],
    [-3203, "找不到這個 HoYoverse 帳號"],
    [-3202, "帳號被鎖住"],
    [-3206, "驗證碼寄太多次"],
  ])("錯誤代碼 %s：寫中文的原因（%s）", (retcode, text) => {
    expect(interpretAppLogin({ retcode, message: "english", data: null }, headerOf({}))).toMatchObject({ kind: "error", retcode, message: expect.stringContaining(text) });
  });

  it("連不上或回應不是 JSON：說暫時無法登入，不當成密碼錯誤", () => {
    expect(interpretAppLogin({ localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" }, headerOf({}))).toMatchObject({ kind: "error", message: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" });
    expect(interpretAppLogin(null, headerOf({}))).toMatchObject({ kind: "error", retcode: null });
  });
});

describe("圖形驗證與 email 驗證要帶回去的資料", () => {
  it("x-rpc-aigis：session id、分號，接 Geetest 結果的 JSON 轉 base64（欄位照 genshin.py 的順序）", () => {
    const result = { captcha_id: "captcha-1", lot_number: "lot", pass_token: "pass", gen_time: "1700000000", captcha_output: "out" };
    const expected = `session-1;${Buffer.from('{"captcha_id":"captcha-1","lot_number":"lot","pass_token":"pass","gen_time":"1700000000","captcha_output":"out"}').toString("base64")}`;

    expect(aigisHeader("session-1", { captcha_output: "out", gen_time: "1700000000", pass_token: "pass", lot_number: "lot", captcha_id: "captcha-1" })).toBe(expected);
    expect(aigisHeader("session-1", result)).toBe(expected);
  });

  it("從 x-rpc-verify 取出驗證 email 用的 ticket；格式不對時回 null", () => {
    expect(verifyTicketOf(VERIFY)).toBe("ticket-1");
    expect(verifyTicketOf("not json")).toBeNull();
    expect(verifyTicketOf(JSON.stringify({ risk_ticket: "rt" }))).toBeNull();
  });

  it("email 驗證碼：成功；錯了或過期（-3205）寫中文的原因", () => {
    expect(interpretEmailVerify({ retcode: 0, message: "OK", data: null })).toEqual({ ok: true });
    expect(interpretEmailVerify({ retcode: -3205, message: "invalid", data: null })).toEqual({ ok: false, message: "email 驗證碼錯了或過期了，請重新輸入" });
  });
});

describe("interpretTokens（用 stoken 換新的 ltoken_v2 與 cookie_token_v2）", () => {
  it("token_type 2 是 ltoken_v2、4 是 cookie_token_v2", () => {
    const json = { retcode: 0, message: "OK", data: { tokens: [{ token_type: 2, token: "v2_lt" }, { token_type: 4, token: "v2_ct" }] } };

    expect(interpretTokens(json)).toEqual({ ok: true, ltoken: "v2_lt", cookieToken: "v2_ct" });
  });

  it("少了其中一個、或 stoken 失效（例如改了密碼）：換不了", () => {
    expect(interpretTokens({ retcode: 0, message: "OK", data: { tokens: [{ token_type: 2, token: "v2_lt" }] } })).toMatchObject({ ok: false });
    expect(interpretTokens({ retcode: -100, message: "not login", data: null })).toMatchObject({ ok: false, retcode: -100 });
  });
});
