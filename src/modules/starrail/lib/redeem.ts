// 依 genshin.py 的 redeem_code 整理 還沒用真實帳號驗證
// 手動輸入的兌換碼與結果都不存 自動兌換只記下試過的社群公開兌換碼

import { asRecord, numberOf } from "@/core/json";
import { cookieKeys } from "./cookie";
import { DAILY_LIMIT, GEETEST, NOT_LOGGED_IN, TOO_FREQUENT } from "./retcodes";

/** 真的有 5 個字的兌換碼 例如 OMEGA 下限放寬到 4 */
const CODE = /^[A-Z0-9]{4,20}$/;
const CODE_RULE = "兌換碼是 4–20 個英文字母或數字";

/** 複製來的兌換碼常夾著空白或全形字 所以去掉空白 轉大寫並換成半形 */
export function normalizeRedeemCode(input: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = input.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  if (!code) return { ok: false, error: "請輸入兌換碼" };
  return CODE.test(code) ? { ok: true, code } : { ok: false, error: CODE_RULE };
}

/** 兌換要 cookie_token_v2 加帳號 id 沒貼就請使用者重新連結 訊息只列欄位名稱 */
export function redeemCookieProblem(cookie: string): string | null {
  const keys = cookieKeys(cookie);
  const missing = [
    !keys.has("cookie_token_v2") && "cookie_token_v2",
    !keys.has("account_id_v2") && !keys.has("account_mid_v2") && "account_id_v2（或 account_mid_v2）",
  ].filter((key): key is string => Boolean(key));
  if (missing.length === 0) return null;
  return `兌換需要 cookie 裡的 ${missing.join("、")}，請用頁面下方的「新增帳號或更新 cookie」重新連結並一起貼上`;
}

export type RedeemOutcome = { ok: boolean; message: string; retcode: number | null; cookieInvalid: boolean };

const INVALID = "兌換碼無效，請確認有沒有打錯";
const ALREADY = "已經兌換過這個兌換碼了";
const LEVEL = "開拓等級不足，還不能兌換這個兌換碼";
const TOO_FREQUENT_MESSAGE = "HoYoLAB 說請求太頻繁，請稍後再試";
const RISK_MESSAGE = "HoYoLAB 要求驗證，請到官方兌換頁（hsr.hoyoverse.com/gift）兌換";
/** 驗證碼與風控 加上社群兌換機器人遇過的 -502 */
const RISK = [...GEETEST, -502];
/** 1028 也是 genshin.py 的 VisitsTooFrequently */
const RATE_LIMIT = [TOO_FREQUENT, 1028, DAILY_LIMIT];
/** genshin.py 的 Redemption code not activated 直播碼這類還沒開放的 */
const NOT_ACTIVE = -2014;
/** 依 genshin.py 的 errors.py -2016 是兩次兌換之間約 5 秒的冷卻 */
const MESSAGES: Record<number, string> = {
  [-2003]: INVALID,
  [-2004]: INVALID,
  [-1065]: INVALID,
  [NOT_ACTIVE]: "這個兌換碼還沒開放，晚一點再試",
  [-2001]: "兌換碼已過期",
  [-2006]: "兌換碼的使用次數已滿",
  [-2017]: ALREADY,
  [-2018]: ALREADY,
  [-2016]: "兌換太頻繁，請等約 5 秒再試",
  [-2011]: LEVEL,
  [-2021]: LEVEL,
  [-2008]: "這個兌換碼不能在這個伺服器使用",
  ...Object.fromEntries(RATE_LIMIT.map((code) => [code, TOO_FREQUENT_MESSAGE])),
  ...Object.fromEntries(RISK.map((code) => [code, RISK_MESSAGE])),
};
/** -1071 是兌換介面的 cookie 無效 */
const COOKIE_INVALID = new Set([...NOT_LOGGED_IN, -1071]);

export function interpretRedeem(json: unknown): RedeemOutcome {
  const body = asRecord(json);
  const retcode = numberOf(body?.retcode);
  if (retcode === 0) return { ok: true, message: "獎勵會寄到遊戲內信箱", retcode, cookieInvalid: false };
  if (retcode === null) {
    const local = typeof body?.localError === "string" ? body.localError : "HoYoLAB 回應格式和預期不同";
    return { ok: false, message: local, retcode: null, cookieInvalid: false };
  }
  if (COOKIE_INVALID.has(retcode)) return { ok: false, message: "HoYoLAB cookie 已失效，請重新登入 hoyolab.com 後重新連結", retcode, cookieInvalid: true };
  // 結果框的標題已經寫兌換失敗 說明只寫原因
  return { ok: false, message: MESSAGES[retcode] ?? `原因不明（錯誤代碼 ${retcode}）`, retcode, cookieInvalid: false };
}

/**
 * 自動兌換依結果決定下一步 settled 是答案不會變 記下來不再送出
 * 還沒開放 冷卻 太頻繁 風控 cookie 失效 連不上 等級不足或認不得的代碼都明天再試 過期的碼清單自然不再列出
 */
type RedeemVerdict =
  | { kind: "success" | "already" | "expired" | "invalid"; settled: true }
  | { kind: "inactive" | "level" | "failed" | "cooldown" | "rate_limit" | "cookie" | "risk" | "network"; settled: false };

const SETTLED: Record<number, "already" | "expired" | "invalid"> = {
  [-2017]: "already",
  [-2018]: "already",
  [-2001]: "expired",
  [-2003]: "invalid",
  [-2004]: "invalid",
  [-1065]: "invalid",
  [-2006]: "invalid",
  [-2008]: "invalid",
};

export function redeemVerdict(outcome: RedeemOutcome): RedeemVerdict {
  if (outcome.ok) return { kind: "success", settled: true };
  if (outcome.retcode === null) return { kind: "network", settled: false };
  if (outcome.cookieInvalid) return { kind: "cookie", settled: false };
  if (RISK.includes(outcome.retcode)) return { kind: "risk", settled: false };
  if (RATE_LIMIT.includes(outcome.retcode)) return { kind: "rate_limit", settled: false };
  if (outcome.retcode === -2016) return { kind: "cooldown", settled: false };
  if (outcome.retcode === NOT_ACTIVE) return { kind: "inactive", settled: false };
  if (outcome.retcode === -2011 || outcome.retcode === -2021) return { kind: "level", settled: false };
  const settled = SETTLED[outcome.retcode];
  return settled ? { kind: settled, settled: true } : { kind: "failed", settled: false };
}
