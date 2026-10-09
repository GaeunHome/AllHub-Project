// "use server" 的檔案只能匯出 async 函式，表單（瀏覽器）與 Server Action 共用的文字與欄位名稱放這裡

/** 帳號不存在、密碼錯誤、帳號鎖定中都用這一句，不透露帳號是否存在 */
export const INVALID_CREDENTIALS = "帳號或密碼錯誤";

/** 註冊表單的蜜罐欄位：移到畫面外、不能用 Tab 選到，只有自動填表的機器人會填 */
export const HONEYPOT_FIELD = "website";

/** 登入失敗時的補充說明：帳號存不存在、有沒有被鎖都顯示同一段，不透露任何狀態 */
export function credentialsHint(error: string | undefined): string | null {
  return error === INVALID_CREDENTIALS ? "同一個帳號連續輸錯幾次後會暫時鎖定，請過一段時間再試；忘記密碼請聯絡站長。" : null;
}

/** 登入與註冊各用各的驗證碼，同時開著兩個頁面也不會互相蓋掉 */
export const CAPTCHA_PURPOSES = ["login", "register"] as const;
export type CaptchaPurpose = (typeof CAPTCHA_PURPOSES)[number];
export const CAPTCHA_FIELD = "captcha";
export const CAPTCHA_ERROR = "驗證碼錯誤，請重新輸入";

/** 驗證碼圖片的網址：由伺服器算繪頁面時呼叫（Server Component 每個請求只算繪一次），t 讓每次打開頁面都是不同的網址，瀏覽器不會拿舊的圖 */
export function captchaImageUrl(purpose: CaptchaPurpose, time = Date.now()): string {
  return `/api/auth/captcha?for=${purpose}&t=${time}`;
}
