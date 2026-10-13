import { after } from "next/server";
import { logError } from "@/core/errors";
import { syncCookieInvalid, type StarrailAccountView } from "../service/accounts";

/** 快取函式裡不能寫入：HoYoLAB 回應的 cookie 狀態跟帳號上的標記不同時，回應送出後再寫回 */
export function syncCookieFlagAfter(userId: string, account: StarrailAccountView, invalid: boolean): void {
  if (invalid === account.cookieInvalid) return;
  after(() => syncCookieInvalid(userId, account.id, invalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
}
