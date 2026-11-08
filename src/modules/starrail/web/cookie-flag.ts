import { after } from "next/server";
import { logError } from "@/core/errors";
import { syncCookieInvalid, type StarrailAccountView } from "../service/accounts";

/**
 * 快取函式裡不能寫 標記不同時在回應送出後寫回
 * 只給即時便箋用 各區塊各自設定的話會在換頁間來回跳
 */
export function syncCookieFlagAfter(userId: string, account: StarrailAccountView, invalid: boolean): void {
  if (invalid === account.cookieInvalid) return;
  after(() => syncCookieInvalid(userId, account.id, invalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
}
