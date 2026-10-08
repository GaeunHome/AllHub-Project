import { requireSession } from ".";

/** 放在版面裡：沒有讀資料的頁面（首頁、帳號頁）也要擋下改密碼後的舊 cookie，proxy 只驗簽章擋不住 */
export async function SessionGuard() {
  await requireSession();
  return null;
}
