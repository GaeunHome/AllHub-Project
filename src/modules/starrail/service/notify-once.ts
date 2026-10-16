import "server-only";
import { createHash } from "node:crypto";
import { claimOnce, releaseOnce } from "@/core/auth/attempts";
import { logError } from "@/core/errors";

/**
 * 同一件事只通知一次 先認領再寄 寄不出去就放掉認領 下一輪排程再試
 * 認領記在 core_rate_limits 一天後就刪 key 只存帳號與期別的雜湊
 */
export async function notifyOnce(kind: string, accountId: number, period: string, now: Date, send: () => Promise<void>): Promise<boolean> {
  const scope = `starrail:${kind}`;
  const key = createHash("sha256").update(`${accountId}:${period}`).digest("hex");
  if (!(await claimOnce(scope, key, now))) return false;
  try {
    await send();
    return true;
  } catch (error) {
    try {
      await releaseOnce(scope, key);
    } catch (releaseError) {
      logError("starrail", "放掉通知的認領失敗", releaseError);
    }
    throw error;
  }
}
