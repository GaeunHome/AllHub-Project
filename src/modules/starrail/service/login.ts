import "server-only";
import { createHash } from "node:crypto";
import { recordAttempt } from "@/core/auth/attempts";
import { asRecord, text } from "@/core/json";
import { HOUR_MS } from "@/core/time";
import { loginCookie } from "../lib/cookie";
import { appLogin, tokensFromStoken, verifyEmailCode } from "../lib/hoyolab";
import { aigisHeader, verifyTicketOf, type CaptchaChallenge } from "../lib/passport";
import type { Outcome } from "./accounts";
import { linkAccount, type RoleChoice } from "./link";

// 使用者要的 用 HoYoverse 帳號密碼連結 拿到 stoken 之後 cookie 能自動換新
// 帳號密碼只在這次請求轉給 HoYoverse 不存也不記 log

/**
 * 每一步都帶著帳號密碼與同一個 device id 再登入一次
 * aigis 是瀏覽器解完 Geetest 的結果加上 session id 的 JSON verify 與 code 是 email 驗證
 */
export type LoginFields = { account: string; password: string; deviceId: string; aigis?: string; verify?: string; code?: string };

/** roles 時 cookie 交給瀏覽器 選好伺服器後跟貼上的一樣再送一次 */
export type LoginOutcome =
  | { step: "captcha"; captcha: CaptchaChallenge }
  | { step: "email"; verify: string }
  | { step: "roles"; roles: RoleChoice[]; cookie: string }
  | Outcome<{ message: string; warning?: string; accountId: number }>;

/** 只算第一步 每人每小時 5 次 之後的驗證不算 */
const LOGIN_SCOPE = "starrail:login";
const LOGIN_MAX = 5;
const DEVICE_ID = /^[a-z0-9]{16}$/;
const EMAIL_CODE = /^\d{4,8}$/;
const MAX_LENGTH = 200;
const GEETEST_KEYS = ["captcha_id", "lot_number", "pass_token", "gen_time", "captcha_output"] as const;

function fieldProblem({ account, password, deviceId, verify, code }: LoginFields): string | null {
  if (account.trim() === "" || account.length > MAX_LENGTH) return "請填 HoYoverse 的 email 或帳號";
  if (password === "" || password.length > MAX_LENGTH) return "請填密碼";
  if (!DEVICE_ID.test(deviceId)) return "請重新整理頁面再登入";
  if (verify && !EMAIL_CODE.test(code ?? "")) return "請填 email 收到的驗證碼（數字）";
  return null;
}

/** 瀏覽器送來的 Geetest 結果組成 x-rpc-aigis 欄位不齊時回 null */
function aigisOf(raw: string): string | null {
  let root: Record<string, unknown> | null;
  try {
    root = asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
  const sessionId = text(root?.sessionId);
  const values = GEETEST_KEYS.map((key) => text(root?.[key]));
  if (!sessionId || values.some((value) => value === null)) return null;
  const [captcha_id, lot_number, pass_token, gen_time, captcha_output] = values as string[];
  return aigisHeader(sessionId, { captcha_id, lot_number, pass_token, gen_time, captcha_output });
}

export async function loginAccount(userId: string, fields: LoginFields, now = new Date()): Promise<LoginOutcome> {
  const problem = fieldProblem(fields);
  if (problem) return { ok: false, error: problem };
  if (!fields.verify && !fields.aigis) {
    const gate = await recordAttempt({ scope: LOGIN_SCOPE, max: LOGIN_MAX, windowMs: HOUR_MS }, createHash("sha256").update(userId).digest("hex"), now);
    if (!gate.allowed) return { ok: false, error: `登入嘗試太多次，請 ${Math.ceil(gate.retryAfterMs / 60_000)} 分鐘後再試` };
  }

  if (fields.verify) {
    const ticket = verifyTicketOf(fields.verify);
    if (!ticket) return { ok: false, error: "email 驗證的資料不完整，請重新登入" };
    const verified = await verifyEmailCode(ticket, fields.code ?? "");
    if (!verified?.ok) return { ok: false, error: verified?.message ?? "email 驗證失敗，請重新登入" };
  }
  const aigis = fields.aigis ? aigisOf(fields.aigis) : undefined;
  if (aigis === null) return { ok: false, error: "圖形驗證的結果不完整，請重新登入" };

  const step = await appLogin({
    account: fields.account.trim(),
    password: fields.password,
    deviceId: fields.deviceId,
    ...(aigis ? { aigis } : {}),
    ...(fields.verify ? { verify: fields.verify } : {}),
  });
  if (step.kind === "captcha") return { step: "captcha", captcha: step.captcha };
  if (step.kind === "email") return { step: "email", verify: step.verify };
  if (step.kind === "error") return { ok: false, error: step.message };

  const tokens = await tokensFromStoken(step.stoken, step.mid);
  if (!tokens.ok) return { ok: false, error: tokens.message };
  const cookie = loginCookie({ aid: step.aid, mid: step.mid, stoken: step.stoken, ltoken: tokens.ltoken, cookieToken: tokens.cookieToken });
  const linked = await linkAccount(userId, cookie, "ask");
  return "roles" in linked ? { step: "roles", roles: linked.roles, cookie } : linked;
}
