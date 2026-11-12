import "server-only";
import { and, eq } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { takeCooldown } from "@/core/cooldown";
import { decryptSecret, encryptSecret } from "@/core/crypto";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { canRefresh, refreshPartsOf, withTokens } from "../lib/cookie";
import { tokensFromStoken } from "../lib/hoyolab";
import type { HoyolabResult } from "../lib/responses";
import { isLoginExpired } from "../lib/retcodes";
import { STARRAIL_HREF } from "../lib/urls";
import { starrailAccounts, type StarrailAccount } from "../data/schema";
import { ownAccount, setCookieInvalid, type AccountChanges } from "./accounts";
import { starrailTags } from "./cache-tags";
import { notifyOwner } from "./notices";

// 使用者要的 盡可能保存 cookie 用帳號密碼登入時存下 stoken 登入過期時拿它換新

/** 好幾塊同時讀到過期 一分鐘內只換一次 */
const REFRESH_COOLDOWN_MS = 60_000;

type RefreshTarget = Pick<StarrailAccount, "id" | "userId" | "ltuid">;

/** rejected 是 HoYoLAB 拒絕了 stoken 例如改了密碼 連不上這類暫時的不算 */
export type Refreshed = { ok: true; cookie: string } | { ok: false; rejected: boolean };

/** 換新 ltoken_v2 與 cookie_token_v2 同一個 HoYoLAB 帳號連結的每個角色一起換 */
export async function refreshCookie(account: RefreshTarget, cookie: string, changes?: AccountChanges): Promise<Refreshed> {
  const parts = refreshPartsOf(cookie);
  if (!parts) return { ok: false, rejected: false };
  const tokens = await tokensFromStoken(parts.stoken, parts.mid);
  if (!tokens.ok) {
    console.error("[starrail] 用 stoken 換新 cookie 失敗", account.id, `retcode ${tokens.retcode}`);
    return { ok: false, rejected: tokens.retcode !== null };
  }
  const next = withTokens(cookie, tokens);
  const updated = await db()
    .update(starrailAccounts)
    .set({ cookieEncrypted: encryptSecret(next), cookieInvalid: false, updatedAt: new Date() })
    .where(and(eq(starrailAccounts.userId, account.userId), eq(starrailAccounts.ltuid, account.ltuid)))
    .returning({ id: starrailAccounts.id });
  if (updated.length > 0 && changes) changes.changed = true;
  return { ok: true, cookie: next };
}

/**
 * 換新也失敗 例如改了密碼 標失效並寄一次通知
 * 只在標記從沒失效變成失效時寄 重新登入前不會再寄
 */
export async function markLoginExpired(account: Pick<StarrailAccount, "id" | "userId" | "uid" | "nickname">, changes?: AccountChanges): Promise<void> {
  if (!(await setCookieInvalid(account.id, true, changes))) return;
  try {
    await notifyOwner(account.userId, {
      kind: "login_expired",
      title: `${account.nickname ?? account.uid} 的 HoYoLAB 登入已失效`,
      body: "自動換新也失敗了，可能改了密碼或登出了所有裝置，請用帳號密碼重新登入",
      url: STARRAIL_HREF,
    });
  } catch (error) {
    logError("starrail", "寄登入失效的通知失敗", error, account.uid);
  }
}

/**
 * 排程讀到登入過期時 有 stoken 就換新再讀一次
 * expired 是換新也失敗 呼叫端標失效並通知 cookie 是接著要用的 換新了就是新的
 */
export async function readWithRefresh<T>(
  account: RefreshTarget,
  cookie: string,
  read: (cookie: string) => Promise<HoyolabResult<T>>,
  changes?: AccountChanges,
): Promise<{ result: HoyolabResult<T>; expired: boolean; cookie: string }> {
  const result = await read(cookie);
  if (!isLoginExpired(result) || !canRefresh(cookie)) return { result, expired: false, cookie };
  const fresh = await refreshCookie(account, cookie, changes);
  if (!fresh.ok) return { result, expired: fresh.rejected, cookie };
  return { result: await read(fresh.cookie), expired: false, cookie: fresh.cookie };
}

/**
 * 頁面讀到登入過期時在回應後換新 快取函式裡不能寫
 * 別人的帳號 id 當作不存在 已經標失效的不再換 等排程每小時試
 */
export async function refreshOwnCookie(userId: string, accountId: number): Promise<"refreshed" | "expired" | "skipped"> {
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!account || account.cookieInvalid) return "skipped";
  let cookie: string;
  try {
    cookie = decryptSecret(account.cookieEncrypted);
  } catch {
    return "skipped";
  }
  if (!canRefresh(cookie)) return "skipped";
  if ((await takeCooldown("starrail:refresh", `${account.userId}:${account.ltuid}`, REFRESH_COOLDOWN_MS)) > 0) return "skipped";
  const changes: AccountChanges = { changed: false };
  const fresh = await refreshCookie(account, cookie, changes);
  if (!fresh.ok && fresh.rejected) await markLoginExpired(account, changes);
  if (changes.changed) expireTags(starrailTags.accounts);
  if (fresh.ok) return "refreshed";
  return fresh.rejected ? "expired" : "skipped";
}
