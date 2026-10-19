import "server-only";
import { and, eq } from "drizzle-orm";
import { reencryptEach } from "@/core/crypto";
import { db } from "@/core/db";
import { deleteExpired } from "@/core/retention-cleanup";
import { starrailAccounts, starrailCheckinLogs } from "../data/schema";
import { trackingAccountChanges } from "./accounts";

/** 簽到紀錄屬於通知紀錄 只留最近 14 天 */
export function cleanupCheckinLogs(now = new Date()): Promise<string> {
  return deleteExpired(starrailCheckinLogs.createdAt, "簽到紀錄", now);
}

/** 換金鑰後把舊金鑰加密的 cookie 改用目前金鑰 擁有者停用的也處理 移除舊金鑰前要全部換好 */
export async function reencryptCookies(): Promise<string> {
  const accounts = await db().select().from(starrailAccounts).orderBy(starrailAccounts.id);
  if (accounts.length === 0) return "沒有連結的帳號";

  const { reencrypted, failed } = await trackingAccountChanges((changes) =>
    reencryptEach(accounts, {
      ciphertext: (account) => account.cookieEncrypted,
      // 只在密文沒變時寫回 期間重新連結的新 cookie 不能被舊的蓋掉
      write: async (account, cookieEncrypted) => {
        const updated = await db()
          .update(starrailAccounts)
          .set({ cookieEncrypted })
          .where(and(eq(starrailAccounts.id, account.id), eq(starrailAccounts.cookieEncrypted, account.cookieEncrypted)))
          .returning({ id: starrailAccounts.id });
        if (updated.length > 0) changes.changed = true;
        return updated.length > 0;
      },
      log: { module: "starrail", what: "cookie 重新加密失敗", context: (account) => account.uid },
    }),
  );
  return `${accounts.length} 筆 cookie，重新加密 ${reencrypted} 筆${failed ? `（${failed} 筆失敗，詳見伺服器 log）` : ""}`;
}
