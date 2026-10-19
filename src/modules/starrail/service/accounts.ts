import "server-only";
import { and, eq, getTableColumns, ne } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { decryptSecret } from "@/core/crypto";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { logError } from "@/core/errors";
import { withAccountIds } from "../lib/cookie";
import { redeemCookieProblem } from "../lib/redeem";
import { starrailAccounts, type StarrailAccount } from "../data/schema";
import { starrailTags } from "./cache-tags";

// 帳號本身的讀寫 連結 頁面讀取 兌換 簽到 開拓力與排程各自一個檔 共用這裡的工具
// userId 都是登入者 帳號 id 只在自己的帳號裡找 別人的一律當作不存在

/** 給 Server Action 的結果 失敗時的 error 直接顯示在畫面上 */
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const UNDECRYPTABLE = "cookie 無法解密，請重新連結（換過 ENCRYPTION_KEY 的話，把舊金鑰放進 ENCRYPTION_KEY_PREVIOUS 即可恢復）";
export const ACCOUNT_NOT_FOUND = "找不到這個帳號，請重新整理頁面";

export const ownAccount = (userId: string, accountId: number) => and(eq(starrailAccounts.id, accountId), eq(starrailAccounts.userId, userId));

/**
 * 排程與立即簽到記下有沒有真的改到帳號那一列
 * HoYoLAB 的快取都標著帳號的 tag 有改才讓它失效 頁面才不會每小時重查十幾個端點
 */
export type AccountChanges = { changed: boolean };

/** 排程結束時 有改到帳號才讓帳號的快取失效 中途出錯前改的也算 */
export async function trackingAccountChanges<T>(work: (changes: AccountChanges) => Promise<T>): Promise<T> {
  const changes: AccountChanges = { changed: false };
  try {
    return await work(changes);
  } finally {
    if (changes.changed) expireTags(starrailTags.accounts);
  }
}

/** 換了 ENCRYPTION_KEY 這類解密失敗時回 null 並標記失效 頁面仍能移除或重新連結 */
export async function cookieOf(account: StarrailAccount, changes?: AccountChanges): Promise<string | null> {
  try {
    return decryptSecret(account.cookieEncrypted);
  } catch {
    await setCookieInvalid(account.id, true, changes);
    return null;
  }
}

/**
 * cookie 失效標記只從這裡寫 比對資料庫的值而不是記憶體裡的帳號
 * 同一次簽到先清掉再設上時才不會讀到舊值而跳過 回傳有沒有改
 */
export async function setCookieInvalid(accountId: number, invalid: boolean, changes?: AccountChanges): Promise<boolean> {
  const updated = await db()
    .update(starrailAccounts)
    .set({ cookieInvalid: invalid, updatedAt: new Date() })
    .where(and(eq(starrailAccounts.id, accountId), ne(starrailAccounts.cookieInvalid, invalid)))
    .returning({ id: starrailAccounts.id });
  if (updated.length > 0 && changes) changes.changed = true;
  return updated.length > 0;
}

/** 擁有者被停用時凍結 排程不用他的 cookie 簽到或查便箋 */
export async function listAccounts(): Promise<StarrailAccount[]> {
  return db().select(getTableColumns(starrailAccounts)).from(starrailAccounts).innerJoin(coreUsers, activeOwnerOf(starrailAccounts.userId)).orderBy(starrailAccounts.id);
}

/** 單一帳號出錯不能中斷整批排程 錯誤細節只進 log */
export async function isolate<T extends object>(account: StarrailAccount, work: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await work();
  } catch (error) {
    logError("starrail", "處理帳號時發生錯誤", error, account.uid);
    return { ok: false, error: "發生錯誤（詳見伺服器 log）" };
  }
}

/**
 * 頁面與兌換向 HoYoLAB 送出前先取自己的帳號與 cookie
 * 只讀不寫才能放進快取 失效標記由頁面在回應後寫回
 */
export async function pageAccount(
  userId: string,
  accountId: number,
): Promise<{ ok: true; account: StarrailAccount; cookie: string } | { ok: false; message: string; cookieInvalid: boolean }> {
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!account) return { ok: false, message: ACCOUNT_NOT_FOUND, cookieInvalid: false };
  try {
    return { ok: true, account, cookie: decryptSecret(account.cookieEncrypted) };
  } catch {
    return { ok: false, message: UNDECRYPTABLE, cookieInvalid: true };
  }
}

/**
 * 頁面顯示用的欄位 不含 cookie 連密文也不回傳 才能放進快取
 * canAutoRedeem 是 cookie 有沒有兌換要用的鍵 只是是或否
 */
export type StarrailAccountView = Pick<StarrailAccount, "id" | "uid" | "nickname" | "region" | "level" | "staminaAlertThreshold" | "cookieInvalid" | "autoRedeem" | "gameReminders"> & {
  canAutoRedeem: boolean;
};

export async function listAccountViews(userId: string): Promise<StarrailAccountView[]> {
  const rows = await db()
    .select({
      id: starrailAccounts.id,
      uid: starrailAccounts.uid,
      nickname: starrailAccounts.nickname,
      region: starrailAccounts.region,
      level: starrailAccounts.level,
      staminaAlertThreshold: starrailAccounts.staminaAlertThreshold,
      cookieInvalid: starrailAccounts.cookieInvalid,
      autoRedeem: starrailAccounts.autoRedeem,
      gameReminders: starrailAccounts.gameReminders,
      cookieEncrypted: starrailAccounts.cookieEncrypted,
    })
    .from(starrailAccounts)
    .where(eq(starrailAccounts.userId, userId))
    .orderBy(starrailAccounts.id);
  return rows.map(({ cookieEncrypted, ...view }) => ({ ...view, canAutoRedeem: redeemKeysProblem(cookieEncrypted) === null }));
}

/** 兌換要 cookie_token_v2 與帳號 id 送出時會用 lt 開頭的值補上 account_ 開頭的鍵 */
function redeemKeysProblem(cookieEncrypted: string): string | null {
  try {
    return redeemCookieProblem(withAccountIds(decryptSecret(cookieEncrypted)));
  } catch {
    return UNDECRYPTABLE;
  }
}

export async function removeAccount(userId: string, id: number): Promise<void> {
  await db().delete(starrailAccounts).where(ownAccount(userId, id));
}

/**
 * 打開前先確認 cookie 有兌換要用的鍵 沒有的話說明要補哪些
 * 關掉不用檢查 試過的兌換碼留著 再打開時不會重送
 */
export async function setAutoRedeem(userId: string, id: number, enabled: boolean): Promise<Outcome> {
  const [account] = await db().select({ cookieEncrypted: starrailAccounts.cookieEncrypted }).from(starrailAccounts).where(ownAccount(userId, id));
  if (!account) return { ok: false, error: ACCOUNT_NOT_FOUND };
  const problem = enabled ? redeemKeysProblem(account.cookieEncrypted) : null;
  if (problem) return { ok: false, error: problem };
  await db().update(starrailAccounts).set({ autoRedeem: enabled, updatedAt: new Date() }).where(ownAccount(userId, id));
  return { ok: true };
}

/** 每日實訓 每週內容與終局挑戰的提醒 回傳有沒有找到自己的這個帳號 */
export async function setGameReminders(userId: string, id: number, enabled: boolean): Promise<boolean> {
  const updated = await db().update(starrailAccounts).set({ gameReminders: enabled, updatedAt: new Date() }).where(ownAccount(userId, id)).returning({ id: starrailAccounts.id });
  return updated.length > 0;
}

/** 回傳有沒有找到自己的這個帳號 */
export async function setStaminaThreshold(userId: string, id: number, threshold: number | null): Promise<boolean> {
  const updated = await db()
    .update(starrailAccounts)
    .set({ staminaAlertThreshold: threshold, lastStaminaAlertAt: null, updatedAt: new Date() })
    .where(ownAccount(userId, id))
    .returning({ id: starrailAccounts.id });
  return updated.length > 0;
}

/**
 * 頁面在回應後依 HoYoLAB 的回應同步 cookie 失效標記
 * 有改才讓帳號的快取失效
 */
export async function syncCookieInvalid(userId: string, accountId: number, invalid: boolean): Promise<boolean> {
  const [own] = await db().select({ id: starrailAccounts.id }).from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!own) return false;
  const changed = await setCookieInvalid(accountId, invalid);
  if (changed) expireTags(starrailTags.accounts);
  return changed;
}
