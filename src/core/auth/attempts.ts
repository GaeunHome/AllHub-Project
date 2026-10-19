import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { coreRateLimits } from "../db/schema";
import { coreEnv } from "../env";
import { DAY_MS, HOUR_MS } from "../time";

// 嘗試次數與用過的驗證碼 nonce 都存在 core_rate_limits
// Vercel 是 serverless 記憶體裡的計數各個執行個體各算各的

export type AttemptRule = { scope: string; max: number; windowMs: number };
export type AttemptGate = { allowed: true } | { allowed: false; retryAfterMs: number };

// 時間窗最長一小時 超過一天的紀錄已經用不到
const STALE_MS = DAY_MS;

/** 同一個 IP 送出註冊表單的次數 成功失敗都算 */
export const REGISTER_ATTEMPTS = { scope: "register", max: 10, windowMs: HOUR_MS } satisfies AttemptRule;
/** 同一個 IP 用無效邀請碼的次數 到上限後有效的也先不受理 猜邀請碼就沒有意義 */
export const INVITE_FAILURES = { scope: "invite", max: 10, windowMs: HOUR_MS } satisfies AttemptRule;

/**
 * IPv4 只有 40 億個 單純的 sha256 很快就能反查
 * 加上伺服器密鑰做 HMAC 只拿到資料庫也算不回原本的 IP
 */
export function clientKey(ip: string, secret: string = coreEnv().SESSION_SECRET): string {
  const key = createHmac("sha256", secret).update("allhub:client-key").digest();
  return createHmac("sha256", key).update(ip).digest("hex");
}

function blocked(rule: AttemptRule, windowStartedAt: Date, now: Date): AttemptGate {
  return { allowed: false, retryAfterMs: Math.max(0, windowStartedAt.getTime() + rule.windowMs - now.getTime()) };
}

/** 只看不記 邀請碼失敗才記一次 有效的連結重新整理幾次都不算 */
export async function checkAttempts(rule: AttemptRule, key: string, now = new Date()): Promise<AttemptGate> {
  const [row] = await db()
    .select()
    .from(coreRateLimits)
    .where(and(eq(coreRateLimits.scope, rule.scope), eq(coreRateLimits.keyHash, key), gt(coreRateLimits.windowStartedAt, new Date(now.getTime() - rule.windowMs))));
  return !row || row.attempts < rule.max ? { allowed: true } : blocked(rule, row.windowStartedAt, now);
}

// 記次數與記用過的驗證碼時順便清 不必另外排程
async function deleteStale(now: Date): Promise<void> {
  await db()
    .delete(coreRateLimits)
    .where(lt(coreRateLimits.windowStartedAt, new Date(now.getTime() - STALE_MS)));
}

/**
 * 同一件事只認領一次 例如驗證碼的 nonce 重複的 insert 直接略過 同時送出也只有一個回 true
 * 紀錄一天後清掉 只擋得住一天內的重複 週期超過一天的事不能靠它
 */
export async function claimOnce(scope: string, key: string, now = new Date()): Promise<boolean> {
  const inserted = await db()
    .insert(coreRateLimits)
    .values({ scope, keyHash: key, windowStartedAt: now, attempts: 1 })
    .onConflictDoNothing({ target: [coreRateLimits.scope, coreRateLimits.keyHash] })
    .returning({ keyHash: coreRateLimits.keyHash });
  await deleteStale(now);
  return inserted.length > 0;
}

/**
 * 認領之後要做的事沒做成時放掉 下次才認領得到 例如通知寄不出去
 * key 要跟 claimOnce 時一樣 是呼叫端算好的雜湊
 */
export async function releaseOnce(scope: string, key: string): Promise<void> {
  await db()
    .delete(coreRateLimits)
    .where(and(eq(coreRateLimits.scope, scope), eq(coreRateLimits.keyHash, key)));
}

/**
 * 單一 upsert 在資料庫裡加一 同時送出很多次也不會少算
 * 時間窗過了就從 1 重新算
 */
export async function recordAttempt(rule: AttemptRule, key: string, now = new Date()): Promise<AttemptGate> {
  const windowOver = sql`${coreRateLimits.windowStartedAt} <= ${new Date(now.getTime() - rule.windowMs).toISOString()}::timestamptz`;
  const [row] = await db()
    .insert(coreRateLimits)
    .values({ scope: rule.scope, keyHash: key, windowStartedAt: now, attempts: 1 })
    .onConflictDoUpdate({
      target: [coreRateLimits.scope, coreRateLimits.keyHash],
      set: {
        attempts: sql`case when ${windowOver} then 1 else ${coreRateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${windowOver} then ${now.toISOString()}::timestamptz else ${coreRateLimits.windowStartedAt} end`,
      },
    })
    .returning({ attempts: coreRateLimits.attempts, windowStartedAt: coreRateLimits.windowStartedAt });
  await deleteStale(now);
  return row.attempts <= rule.max ? { allowed: true } : blocked(rule, row.windowStartedAt, now);
}
