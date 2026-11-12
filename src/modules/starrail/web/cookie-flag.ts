import { after } from "next/server";
import { logError } from "@/core/errors";
import { syncCookieInvalid, type StarrailAccountView } from "../service/accounts";
import { refreshOwnCookie } from "../service/refresh";

/**
 * 快取函式裡不能寫 標記不同時在回應送出後寫回
 * 只給即時便箋用 各區塊各自設定的話會在換頁間來回跳
 */
export function syncCookieFlagAfter(userId: string, account: StarrailAccountView, invalid: boolean): void {
  if (invalid === account.cookieInvalid) return;
  after(() => syncCookieInvalid(userId, account.id, invalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
}

type Read = { ok: true } | { ok: false; loginExpired: boolean };

/**
 * 讀到登入過期而且有 stoken 時 回應後換新 好幾塊一起過期也只排一次
 * service 一分鐘內只換一次 換好讓快取失效 重新整理就是新的
 */
export function refreshLoginAfter(userId: string, accountId: number, ...reads: Read[]): void {
  if (!reads.some((read) => !read.ok && read.loginExpired)) return;
  after(async () => {
    try {
      await refreshOwnCookie(userId, accountId);
    } catch (error) {
      logError("starrail", "自動換新 cookie 失敗", error);
    }
  });
}
