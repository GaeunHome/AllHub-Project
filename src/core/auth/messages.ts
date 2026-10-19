// use server 的檔案只能匯出 async 函式 表單與 Server Action 共用的文字放這裡

/** 帳號不存在 密碼錯誤 鎖定中都用這一句 不透露帳號是否存在 */
export const INVALID_CREDENTIALS = "帳號或密碼錯誤";

/**
 * 被次數限制擋下時用 Server Action 與註冊頁共用
 * 登入與確認密碼算的是輸錯的次數 註冊與邀請碼算的是嘗試的次數
 */
export const tooManyAttempts = (retryAfterMs: number, counted: "錯誤" | "嘗試" = "嘗試") => `${counted}次數太多，請 ${Math.ceil(retryAfterMs / 60_000)} 分鐘後再試`;

/** 註冊表單的蜜罐欄位 移到畫面外又不能用 Tab 選到 只有機器人會填 */
export const HONEYPOT_FIELD = "website";

/** 登入失敗的補充說明 不論帳號存不存在或被鎖都顯示同一段 */
export function credentialsHint(error: string | undefined): string | null {
  return error === INVALID_CREDENTIALS ? "同一個帳號連續輸錯幾次後會暫時鎖定，請過一段時間再試；忘記密碼請聯絡站長。" : null;
}

/** 登入與註冊各用各的驗證碼 同時開著兩頁也不會互相蓋掉 */
export const CAPTCHA_PURPOSES = ["login", "register"] as const;
export type CaptchaPurpose = (typeof CAPTCHA_PURPOSES)[number];
export const CAPTCHA_FIELD = "captcha";
export const CAPTCHA_ERROR = "驗證碼錯誤，請重新輸入";
/** 拿掉容易看錯的 0 O Q 1 I L 2 Z 5 S 8 B G 6 環境變數 DEV_CAPTCHA_CODE 也照這個檢查 */
export const CAPTCHA_ALPHABET = "ACDEFHJKMNPRTUVWXY34679";
export const CAPTCHA_LENGTH = 5;

/**
 * 伺服器算繪頁面時呼叫 每個請求只算一次
 * t 讓每次打開頁面的網址都不同 瀏覽器才不會拿舊的圖
 */
export function captchaImageUrl(purpose: CaptchaPurpose, time = Date.now()): string {
  return `/api/auth/captcha?for=${purpose}&t=${time}`;
}
