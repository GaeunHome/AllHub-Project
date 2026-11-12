import { constants, createHash, publicEncrypt, randomInt } from "node:crypto";
import { asRecord, numberOf, text } from "@/core/json";

// HoYoLAB App 的登入與用 stoken 換新 cookie 照 genshin.py 的 auth 與 cookie manager 整理
// 非官方介面 HoYoverse 改版就可能失效 失效時貼 cookie 的方式照常能用

/** HoYoLAB App 的 app id 登入 email 驗證與換新都用它 */
export const PASSPORT_APP_ID = "c9oqaq3s3gu8";
const APP_LOGIN_SALT = "IZPgfb0dRPtBeLuFkdDznSZ6f4wWt6y2";

/** HoYoLAB App 正式環境的 RSA 公鑰 genshin.py 從 App 反編譯取得 */
const LOGIN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4PMS2JVMwBsOIrYWRluY
wEiFZL7Aphtm9z5Eu/anzJ09nB00uhW+ScrDWFECPwpQto/GlOJYCUwVM/raQpAj
/xvcjK5tNVzzK94mhk+j9RiQ+aWHaTXmOgurhxSp3YbwlRDvOgcq5yPiTz0+kSeK
ZJcGeJ95bvJ+hJ/UMP0Zx2qB5PElZmiKvfiNqVUk8A8oxLJdBB5eCpqWV6CUqDKQ
KSQP4sM0mZvQ1Sr4UcACVcYgYnCbTZMWhJTWkrNXqI8TMomekgny3y+d6NX/cFa6
6jozFIF4HCX5aW8bp8C8vq2tFvFbleQ/Q3CU56EWWKMrOcpmFtRmC18s9biZBVR/
8QIDAQAB
-----END PUBLIC KEY-----`;

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS_AND_DIGITS = `${LETTERS}0123456789`;
const randomOf = (alphabet: string) => () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
const md5 = (input: string) => createHash("md5").update(input).digest("hex");

/** 帳號與密碼都要先用公鑰加密 填充方式跟 genshin.py 用的 rsa 套件一樣是 PKCS#1 v1.5 */
export function encryptCredential(value: string): string {
  return publicEncrypt({ key: LOGIN_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(value, "utf8")).toString("base64");
}

/** App 登入的 DS 把送出的 JSON 也算進去 */
export function appLoginDs(body: object, nowMs: number = Date.now(), random: () => string = randomOf(LETTERS_AND_DIGITS)): string {
  const t = Math.floor(nowMs / 1000);
  const r = random();
  return `${t},${r},${md5(`salt=${APP_LOGIN_SALT}&t=${t}&r=${r}&b=${JSON.stringify(body)}&q=`)}`;
}

/** 用 stoken 換新時的 DS 跟戰績類的算法一樣 只是 salt 不同 */
export function passportDs(nowMs: number = Date.now(), random: () => string = randomOf(LETTERS)): string {
  const t = Math.floor(nowMs / 1000);
  const r = random();
  return `${t},${r},${md5(`salt=${APP_LOGIN_SALT}&t=${t}&r=${r}`)}`;
}

/** 圖形驗證要的參數 瀏覽器用它打開 Geetest */
export type CaptchaChallenge = { sessionId: string; captchaId: string; riskType: string };

/** verify 是 HoYoverse 回的 x-rpc-verify 原文 驗證完 email 再帶回去登入 */
export type LoginStep =
  | { kind: "ok"; stoken: string; mid: string; aid: string }
  | { kind: "captcha"; captcha: CaptchaChallenge }
  | { kind: "email"; verify: string }
  | { kind: "error"; retcode: number | null; message: string };

const LOGIN_ERRORS: Record<number, string> = {
  [-3004]: "帳號或密碼錯誤",
  [-3208]: "帳號或密碼錯誤",
  [-3203]: "找不到這個 HoYoverse 帳號，請確認 email 或帳號",
  [-3202]: "帳號被鎖住了，請到 HoYoverse 官網解鎖後再試",
  [-3206]: "驗證碼寄太多次，請過一陣子再試",
  [-3205]: "email 驗證碼錯了或過期了，請重新輸入",
};
const FORMAT_CHANGED = "HoYoverse 的回應格式不同，暫時無法用帳號密碼登入，請改用貼上 cookie";

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

/** 回應的共同部分 連不上時是 send() 放的 localError */
function retcodeOf(json: unknown): { retcode: number | null; error: string | null } {
  const root = asRecord(json);
  const local = text(root?.localError);
  if (local) return { retcode: null, error: local };
  const retcode = numberOf(root?.retcode);
  return { retcode, error: retcode === null ? FORMAT_CHANGED : null };
}

const loginError = (retcode: number): LoginStep => ({ kind: "error", retcode, message: LOGIN_ERRORS[retcode] ?? `HoYoverse 拒絕了登入（代碼 ${retcode}），請稍後再試或改用貼上 cookie` });

/** header 給函式讀 跟 fetch 的 Headers.get 一樣 沒有回 null */
export function interpretAppLogin(json: unknown, header: (name: string) => string | null): LoginStep {
  const { retcode, error } = retcodeOf(json);
  if (error !== null || retcode === null) return { kind: "error", retcode, message: error ?? FORMAT_CHANGED };
  if (retcode === -3101) return captchaStep(header("x-rpc-aigis"));
  if (retcode === -3239) {
    const verify = header("x-rpc-verify");
    return verify && verifyTicketOf(verify) ? { kind: "email", verify } : { kind: "error", retcode, message: FORMAT_CHANGED };
  }
  if (retcode !== 0) return loginError(retcode);
  const data = asRecord(asRecord(json)?.data);
  const stoken = text(asRecord(data?.token)?.token);
  const user = asRecord(data?.user_info);
  const aid = text(user?.aid) ?? (numberOf(user?.aid) === null ? null : String(numberOf(user?.aid)));
  const mid = text(user?.mid);
  return stoken && aid && mid ? { kind: "ok", stoken, mid, aid } : { kind: "error", retcode, message: FORMAT_CHANGED };
}

/** 只支援 v4 登入時帶著 x-rpc-aigis_v4 HoYoverse 照理都回 v4 */
function captchaStep(raw: string | null): LoginStep {
  const aigis = parseJson(raw);
  const data = typeof aigis?.data === "string" ? parseJson(aigis.data) : asRecord(aigis?.data);
  const sessionId = text(aigis?.session_id);
  const captchaId = text(data?.gt) ?? text(data?.captcha_id);
  const riskType = text(data?.risk_type);
  if (data?.use_v4 !== true || !sessionId || !captchaId || !riskType) {
    return { kind: "error", retcode: -3101, message: "HoYoverse 要求的圖形驗證這裡還不支援，請改用貼上 cookie" };
  }
  return { kind: "captcha", captcha: { sessionId, captchaId, riskType } };
}

/** Geetest v4 驗證完的結果 瀏覽器的 captcha.getValidate() */
export type GeetestResult = { captcha_id: string; lot_number: string; pass_token: string; gen_time: string; captcha_output: string };

/** 再登入一次時帶的 x-rpc-aigis 欄位順序照 genshin.py */
export function aigisHeader(sessionId: string, result: GeetestResult): string {
  const { captcha_id, lot_number, pass_token, gen_time, captcha_output } = result;
  const payload = JSON.stringify({ captcha_id, lot_number, pass_token, gen_time, captcha_output });
  return `${sessionId};${Buffer.from(payload).toString("base64")}`;
}

/** x-rpc-verify 的 verify_str 是一段 JSON 字串 驗證 email 要裡面的 ticket */
export function verifyTicketOf(verify: string): string | null {
  const root = parseJson(verify);
  const strategy = typeof root?.verify_str === "string" ? parseJson(root.verify_str) : asRecord(root?.verify_str);
  return text(strategy?.ticket);
}

export function interpretEmailVerify(json: unknown): { ok: true } | { ok: false; message: string } {
  const { retcode, error } = retcodeOf(json);
  if (error !== null || retcode === null) return { ok: false, message: error ?? FORMAT_CHANGED };
  if (retcode === 0) return { ok: true };
  return { ok: false, message: LOGIN_ERRORS[retcode] ?? `email 驗證失敗（代碼 ${retcode}），請重新登入` };
}

export type TokenResult = { ok: true; ltoken: string; cookieToken: string } | { ok: false; retcode: number | null; message: string };

/** 用 stoken 換新 token_type 2 是 ltoken_v2 4 是 cookie_token_v2 */
export function interpretTokens(json: unknown): TokenResult {
  const { retcode, error } = retcodeOf(json);
  if (error !== null || retcode === null) return { ok: false, retcode, message: error ?? FORMAT_CHANGED };
  if (retcode !== 0) return { ok: false, retcode, message: `HoYoLAB 的登入已失效（代碼 ${retcode}），請重新登入` };
  const tokens = asRecord(asRecord(json)?.data)?.tokens;
  const byType = new Map((Array.isArray(tokens) ? tokens : []).map((item) => [numberOf(asRecord(item)?.token_type), text(asRecord(item)?.token)]));
  const ltoken = byType.get(2);
  const cookieToken = byType.get(4);
  return ltoken && cookieToken ? { ok: true, ltoken, cookieToken } : { ok: false, retcode, message: FORMAT_CHANGED };
}
