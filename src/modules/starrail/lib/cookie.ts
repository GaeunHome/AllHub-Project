/**
 * 只留 HoYoLAB 介面需要的鍵 其他追蹤用的 cookie 都丟掉不存
 * stoken 是用帳號密碼登入時拿到的 失效時拿它換新 不送給一般的介面
 */
const KEPT_KEYS = ["ltoken_v2", "ltuid_v2", "ltmid_v2", "account_id_v2", "account_mid_v2", "cookie_token_v2", "stoken"] as const;
const REFRESH_KEY = "stoken";

/** 連結只要 ltoken_v2 與 ltuid_v2 這幾個沒貼的話有些功能不能用 */
const RECOMMENDED_KEYS = ["ltmid_v2", "cookie_token_v2", "account_id_v2", "account_mid_v2"] as const;
type RecommendedKey = (typeof RECOMMENDED_KEYS)[number];

/** 少了這個鍵可能不能用的功能 開拓月曆依 genshin.py issue 151 兌換碼依它的 redeem_code */
const NEEDED_BY: Record<RecommendedKey, string[]> = {
  ltmid_v2: ["即時便箋"],
  cookie_token_v2: ["開拓月曆", "兌換碼", "躍遷紀錄"],
  account_id_v2: ["兌換碼"],
  account_mid_v2: ["開拓月曆"],
};
const FEATURES = ["即時便箋", "開拓月曆", "兌換碼", "躍遷紀錄"];

/** RFC 6265 的 cookie-octet 不合法的字元會讓錯誤訊息帶出整段 cookie 先擋下 */
const COOKIE_OCTETS = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

type ParsedCookie = { ok: true; cookie: string; ltuid: string; missing: RecommendedKey[] } | { ok: false; error: string };

/** 接受 document.cookie 的分號格式或一行一個 錯誤訊息不帶任何 cookie 內容 */
export function parseHoyolabCookie(input: string): ParsedCookie {
  const values = new Map<string, string>();
  for (const part of input.split(/[;\r\n\t]/)) {
    if (part.trim() === "") continue;
    const index = part.indexOf("=");
    if (index <= 0) return { ok: false, error: "cookie 格式看不懂，請用「名稱=值; 名稱=值」的格式貼上，值不能被換行切開" };
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (value) values.set(key, value);
  }

  const missing = (["ltoken_v2", "ltuid_v2"] as const).filter((key) => !values.has(key));
  if (missing.length > 0) {
    return { ok: false, error: `cookie 缺少 ${missing.join("、")}，請確認是在 hoyolab.com 登入後複製的` };
  }

  const kept = KEPT_KEYS.filter((key) => values.has(key));
  const invalid = kept.filter((key) => !COOKIE_OCTETS.test(values.get(key)!));
  if (invalid.length > 0) {
    return { ok: false, error: `cookie 中 ${invalid.join("、")} 的值含有不合法的字元（空白、引號或非英數），請重新複製` };
  }

  return {
    ok: true,
    cookie: kept.map((key) => `${key}=${values.get(key)}`).join("; "),
    ltuid: values.get("ltuid_v2")!,
    missing: RECOMMENDED_KEYS.filter((key) => !values.has(key)),
  };
}

/** 連結結果的提醒 寫出少了哪些鍵與可能不能用的功能 都貼了回 null */
export function missingKeysWarning(missing: readonly RecommendedKey[]): string | null {
  if (missing.length === 0) return null;
  const affected = new Set(missing.flatMap((key) => NEEDED_BY[key]));
  const features = FEATURES.filter((feature) => affected.has(feature));
  return `cookie 少了 ${missing.join("、")}：${features.join("、")}可能無法使用，建議重新貼上完整的 cookie`;
}

/** 存下來的 cookie 已經在連結時整理過 這裡只拆開不檢查 */
function cookieValues(cookie: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) values.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return values;
}

/** 只有鍵名 判斷少了什麼時用 不會把值帶進訊息 */
export function cookieKeys(cookie: string): Set<string> {
  return new Set(cookieValues(cookie).keys());
}

/** 沒貼 account_ 開頭的鍵時改用 lt 開頭的那一個 */
const ACCOUNT_ID_SOURCES = [
  ["account_id_v2", "ltuid_v2"],
  ["account_mid_v2", "ltmid_v2"],
] as const;

/**
 * 開拓月曆與兌換要 account_ 開頭的鍵 沒貼就用 lt 開頭的補
 * 推定是同一組 id HoYoVista 也這樣補 還沒用真實帳號驗證
 */
export function withAccountIds(cookie: string): string {
  const values = cookieValues(cookie);
  const filled = ACCOUNT_ID_SOURCES.flatMap(([key, source]) => {
    const value = values.get(source);
    return !values.has(key) && value ? [`${key}=${value}`] : [];
  });
  return [cookie, ...filled].join("; ");
}

const joinKept = (values: ReadonlyMap<string, string>) =>
  KEPT_KEYS.flatMap((key) => {
    const value = values.get(key);
    return value ? [`${key}=${value}`] : [];
  }).join("; ");

/** 用帳號密碼登入拿到的 組成跟貼上的一樣 帳號 id 與 mid 各填 lt 與 account 兩個 */
export function loginCookie({ aid, mid, stoken, ltoken, cookieToken }: { aid: string; mid: string; stoken: string; ltoken: string; cookieToken: string }): string {
  return joinKept(new Map([["ltoken_v2", ltoken], ["ltuid_v2", aid], ["ltmid_v2", mid], ["account_id_v2", aid], ["account_mid_v2", mid], ["cookie_token_v2", cookieToken], [REFRESH_KEY, stoken]]));
}

/** 一般的介面不用 stoken 送出前拿掉 只有換新時才送 */
export function requestCookie(cookie: string): string {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !part.startsWith(`${REFRESH_KEY}=`))
    .join("; ");
}

/** 換新要 stoken 與 mid mid 就是 ltmid_v2 */
export function refreshPartsOf(cookie: string): { stoken: string; mid: string } | null {
  const values = cookieValues(cookie);
  const stoken = values.get(REFRESH_KEY);
  const mid = values.get("ltmid_v2");
  return stoken && mid ? { stoken, mid } : null;
}

export const canRefresh = (cookie: string): boolean => refreshPartsOf(cookie) !== null;

/** 換新後只換這兩個 其他鍵與 stoken 不動 */
export function withTokens(cookie: string, tokens: { ltoken: string; cookieToken: string }): string {
  const values = cookieValues(cookie);
  values.set("ltoken_v2", tokens.ltoken);
  values.set("cookie_token_v2", tokens.cookieToken);
  return joinKept(values);
}
