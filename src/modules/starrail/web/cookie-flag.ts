import { after } from "next/server";
import { logError } from "@/core/errors";
import { syncCookieInvalid, type StarrailAccountView } from "../service/accounts";

/** 快取函式裡不能寫入 cookie 狀態跟帳號的標記不同時在回應送出後寫回 */
export function syncCookieFlagAfter(userId: string, account: StarrailAccountView, invalid: boolean): void {
  if (invalid === account.cookieInvalid) return;
  after(() => syncCookieInvalid(userId, account.id, invalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
}
