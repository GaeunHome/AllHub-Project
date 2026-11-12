import { describe, expect, it } from "vitest";
import { geetestPayload } from "../geetest-captcha";

const CHALLENGE = { sessionId: "session-1", captchaId: "captcha-1", riskType: "slide", script: "https://static.geetest.com/v4/gt4.js" };
const VALIDATE = { lot_number: "lot", pass_token: "pass", gen_time: "1700000000", captcha_output: "out" };

// 伺服器照 genshin.py 組 x-rpc-aigis 要 session id 與 captcha_id 加上 Geetest 的四個結果
describe("geetestPayload：Geetest 解完的結果送回伺服器", () => {
  it("帶上 session id；結果裡沒有 captcha_id 時用這次驗證的 id 補上", () => {
    expect(JSON.parse(geetestPayload(CHALLENGE, VALIDATE))).toEqual({ sessionId: "session-1", captcha_id: "captcha-1", ...VALIDATE });
  });

  it("結果自己帶了 captcha_id 時照用", () => {
    expect(JSON.parse(geetestPayload(CHALLENGE, { ...VALIDATE, captcha_id: "captcha-2" })).captcha_id).toBe("captcha-2");
  });
});
