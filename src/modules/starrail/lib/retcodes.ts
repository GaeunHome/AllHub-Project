// HoYoLAB 的錯誤代碼 依 genshin.py 的 errors.py 與 constants.py 整理 戰績 簽到與兌換共用

/** 沒登入或 cookie 無效 */
export const NOT_LOGGED_IN = [-100, 10001];
/** 今天的查詢次數到上限 genshin.py 的 TooManyRequests */
export const DAILY_LIMIT = 10101;
/** 資料沒有公開 */
export const DATA_NOT_PUBLIC = 10102;
/** 查詢太頻繁 genshin.py 的 VisitsTooFrequently */
export const TOO_FREQUENT = -110;
/** 要求驗證碼 genshin.py 的 GEETEST_RETCODES */
export const GEETEST = [1034, 5003, 10035, 10041];
/** 今天已經簽過 */
export const ALREADY_SIGNED = -5003;

/** 回 -100 或 10001 是登入過期 ltoken_v2 與 cookie_token_v2 都可能 有 stoken 時可以換新 */
export const isLoginExpired = (result: { ok: true } | { ok: false; retcode: number | null }): boolean => !result.ok && result.retcode !== null && NOT_LOGGED_IN.includes(result.retcode);
