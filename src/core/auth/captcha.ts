import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { coreEnv, devEnv } from "../env";
import { claimOnce } from "./attempts";
import { generateCaptchaCode, renderCaptchaSvg } from "./captcha-image";
import type { CaptchaPurpose } from "./messages";

// 圖形驗證碼：cookie 只放 nonce、到期時間與兩個 HMAC，不放驗證碼本身；不含答案的那個先證明 cookie 是伺服器發的，答案送來時再重算含答案的比對，nonce 用過就記在資料庫

export const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const NONCE_SCOPE = "captcha";
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})\.(\d{13})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

export const captchaCookieName = (purpose: CaptchaPurpose) => `hub_captcha_${purpose}`;

/** 跟 IP 雜湊（attempts.ts 的 clientKey）用不同的標籤衍生，同一個 SESSION_SECRET 也不會兩邊共用金鑰 */
function captchaKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("allhub:captcha").digest();
}

function sign(purpose: CaptchaPurpose, code: string, nonce: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", captchaKey(secret)).update(`answer|${purpose}|${code}|${nonce}|${expiresAt}`).digest("base64url");
}

/** 不含答案：驗證碼還沒比對前，先確認 cookie 是伺服器發的、沒被改過期限或用途，偽造的 cookie 才不會寫進資料庫 */
function signToken(purpose: CaptchaPurpose, nonce: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", captchaKey(secret)).update(`token|${purpose}|${nonce}|${expiresAt}`).digest("base64url");
}

function sameMac(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 不分大小寫、全形也算、空白不算 */
export function normalizeCaptchaAnswer(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function createCaptchaToken(purpose: CaptchaPurpose, code: string, now = new Date(), secret = coreEnv().SESSION_SECRET): string {
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = now.getTime() + CAPTCHA_TTL_MS;
  return `${nonce}.${expiresAt}.${sign(purpose, normalizeCaptchaAnswer(code), nonce, expiresAt, secret)}.${signToken(purpose, nonce, expiresAt, secret)}`;
}

type CaptchaToken = { nonce: string; expiresAt: number; mac: string };

/** 格式、期限與不含答案的 HMAC 都對才回傳：還沒比對答案，也還沒碰資料庫 */
function issuedToken(purpose: CaptchaPurpose, token: string | undefined, now: Date, secret: string): CaptchaToken | null {
  const match = token ? TOKEN_PATTERN.exec(token) : null;
  if (!match) return null;
  const [, nonce, expires, mac, tokenMac] = match;
  const expiresAt = Number(expires);
  if (expiresAt <= now.getTime() || !sameMac(signToken(purpose, nonce, expiresAt, secret), tokenMac)) return null;
  return { nonce, expiresAt, mac };
}

/** 只驗格式、期限與兩個 HMAC，不碰資料庫；nonce 有沒有用過由 verifyCaptcha 檢查 */
export function verifyCaptchaToken(purpose: CaptchaPurpose, answer: string, token: string | undefined, now = new Date(), secret = coreEnv().SESSION_SECRET): boolean {
  const parsed = issuedToken(purpose, token, now, secret);
  return parsed !== null && sameMac(sign(purpose, normalizeCaptchaAnswer(answer), parsed.nonce, parsed.expiresAt, secret), parsed.mac);
}

/** 伺服器發的、期限內的 cookie 不論答對答錯都先用掉 nonce：同一張圖不能換答案一直猜，也不能重送；偽造的 cookie 在寫資料庫之前就擋下 */
export async function verifyCaptcha(purpose: CaptchaPurpose, answer: string, token: string | undefined, now = new Date()): Promise<boolean> {
  const secret = coreEnv().SESSION_SECRET;
  const parsed = issuedToken(purpose, token, now, secret);
  if (!parsed) return false;
  if (!(await claimOnce(NONCE_SCOPE, createHash("sha256").update(parsed.nonce).digest("hex"), now))) return false;
  return verifyCaptchaToken(purpose, answer, token, now, secret);
}

/** 讀出並立刻清掉這次表單的驗證碼 cookie：不論後面成功或失敗，每張圖只能送出一次，畫面會換一張新的 */
export async function takeCaptchaToken(purpose: CaptchaPurpose): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(captchaCookieName(purpose))?.value;
  store.delete(captchaCookieName(purpose));
  return token;
}

/** 產生新的驗證碼：設 cookie、回傳 SVG。DEV_CAPTCHA_CODE 只在非 production 生效，production 先返回、連設定都不讀 */
export async function issueCaptcha(purpose: CaptchaPurpose, now = new Date()): Promise<string> {
  const fixed = process.env.NODE_ENV === "production" ? undefined : devEnv().DEV_CAPTCHA_CODE;
  const code = fixed ?? generateCaptchaCode();
  (await cookies()).set(captchaCookieName(purpose), createCaptchaToken(purpose, code, now), {
    httpOnly: true,
    // 跟登入 cookie 一樣只在 production 加 Secure：本機開發可能用 http 的區網 IP 打開
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CAPTCHA_TTL_MS / 1000,
  });
  return renderCaptchaSvg(code);
}
