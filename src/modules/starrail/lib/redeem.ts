// 兌換碼（跟 hsr.hoyoverse.com/gift 一樣）：依 genshin.py 的 redeem_code 整理、尚未用真實帳號驗證；兌換碼與結果都不存

import { asRecord, number } from "./json";

const CODE = /^[A-Z0-9]{6,20}$/;
const CODE_RULE = "兌換碼是 6–20 個英文字母或數字";

/** 轉大寫、去掉空白、全形換半形；網站上複製來的兌換碼常夾著空白或全形字 */
export function normalizeRedeemCode(input: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = input.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  if (!code) return { ok: false, error: "請輸入兌換碼" };
  return CODE.test(code) ? { ok: true, code } : { ok: false, error: CODE_RULE };
}

/** 兌換用的是 cookie_token_v2 加帳號 id；連結時沒貼的話要請使用者重新連結，訊息只列欄位名稱 */
export function redeemCookieProblem(cookie: string): string | null {
  const keys = new Set(cookie.split(";").map((part) => part.split("=")[0]?.trim()));
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
/** 依 genshin.py 的 errors.py：-2016 是兩次兌換之間的冷卻（約 5 秒） */
const MESSAGES: Record<number, string> = {
  [-2003]: INVALID,
  [-2004]: INVALID,
  [-1065]: INVALID,
  [-2014]: INVALID,
  [-2001]: "兌換碼已過期",
  [-2006]: "兌換碼的使用次數已滿",
  [-2017]: ALREADY,
  [-2018]: ALREADY,
  [-2016]: "兌換太頻繁，請等約 5 秒再試",
  [-2011]: LEVEL,
  [-2021]: LEVEL,
};
/** -100、10001：沒登入或 cookie 無效；-1071：兌換介面的 cookie 無效 */
const COOKIE_INVALID = new Set([-100, 10001, -1071]);

export function interpretRedeem(json: unknown): RedeemOutcome {
  const body = asRecord(json);
  const retcode = number(body?.retcode);
  if (retcode === 0) return { ok: true, message: "兌換成功，獎勵會寄到遊戲內信箱", retcode, cookieInvalid: false };
  if (retcode === null) {
    const local = typeof body?.localError === "string" ? body.localError : "HoYoLAB 回應格式和預期不同";
    return { ok: false, message: local, retcode: null, cookieInvalid: false };
  }
  if (COOKIE_INVALID.has(retcode)) return { ok: false, message: "HoYoLAB cookie 已失效，請重新登入 hoyolab.com 後重新連結", retcode, cookieInvalid: true };
  return { ok: false, message: MESSAGES[retcode] ?? `兌換失敗（代碼 ${retcode}）`, retcode, cookieInvalid: false };
}
