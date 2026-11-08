import "server-only";
import { createHash } from "node:crypto";
import { recordAttempt } from "./auth/attempts";

/**
 * 每人在 ms 內只能做一次 例如會呼叫外部 API 很多次的手動同步
 * 回傳還要等幾秒 0 代表可以做 計數存資料庫 各執行個體共用
 */
export async function takeCooldown(scope: string, userId: string, ms: number, now = new Date()): Promise<number> {
  const gate = await recordAttempt({ scope, max: 1, windowMs: ms }, createHash("sha256").update(userId).digest("hex"), now);
  return gate.allowed ? 0 : Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
}
