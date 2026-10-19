import "server-only";
import { withAccountIds } from "../lib/cookie";
import { redeemCode } from "../lib/hoyolab";
import { normalizeRedeemCode, redeemCookieProblem } from "../lib/redeem";
import { pageAccount, type Outcome } from "./accounts";

/**
 * 手動輸入的兌換碼與結果都不存 log 只記 retcode
 * 帳號的 cookie 失效標記只看即時便箋與簽到 兌換失敗只回自己的錯誤
 */
export async function redeemCodeFor(userId: string, accountId: number, input: string): Promise<Outcome<{ message: string }>> {
  const normalized = normalizeRedeemCode(input);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ok: false, error: target.message };
  // 送出時會用 lt 開頭的值補上 account_ 開頭的鍵 檢查也照補完的看
  const problem = redeemCookieProblem(withAccountIds(target.cookie));
  if (problem) return { ok: false, error: problem };

  const outcome = await redeemCode(target.cookie, target.account.uid, target.account.region, normalized.code);
  if (outcome.ok) return { ok: true, message: outcome.message };
  console.error("[starrail] 兌換失敗", accountId, `retcode ${outcome.retcode}`);
  return { ok: false, error: outcome.message };
}
