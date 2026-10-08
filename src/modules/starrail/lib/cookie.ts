/** 只留 HoYoLAB 介面需要的鍵，其他追蹤用 cookie 一律丟掉，不存進資料庫 */
const KEPT_KEYS = ["ltoken_v2", "ltuid_v2", "ltmid_v2", "account_id_v2", "account_mid_v2", "cookie_token_v2"] as const;

/** RFC 6265 cookie-octet：不合法的字元送進 fetch 會讓錯誤訊息帶出整段 cookie，所以先擋下 */
const COOKIE_OCTETS = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

export type ParsedCookie = { ok: true; cookie: string; ltuid: string; hasLtmid: boolean } | { ok: false; error: string };

/** 接受 document.cookie 的分號格式，也接受一行一個（換行或 tab 分隔）。錯誤訊息不帶任何 cookie 內容。 */
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
    hasLtmid: values.has("ltmid_v2"),
  };
}
