import { UserError } from "@/core/form";

/** 翻譯與翻譯設定的使用者錯誤 訊息直接顯示在畫面上 */
export class TranslationUserError extends UserError {}

/** 金鑰沒設定或解不開只能到翻譯設定處理 畫面要附上設定頁連結 */
export class ApiKeySetupError extends TranslationUserError {}
