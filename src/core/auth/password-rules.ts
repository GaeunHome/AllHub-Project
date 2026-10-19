// 瀏覽器的註冊與改密碼表單也用這些長度 所以獨立成不 import 任何東西的檔案
// 帳號的長度也在這裡 跟 core/db/schema.ts 的帳號格式檢查一致
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
