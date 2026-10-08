/** 記憶體內計數，serverless 多實例時各算各的、只是盡力而為；主要防線是夠長的密碼與 scrypt 雜湊 */
export function createFailureLimiter({ maxFailures, windowMs, lockMs }: { maxFailures: number; windowMs: number; lockMs: number }) {
  const failures = new Map<string, number[]>();
  const lockedUntil = new Map<string, number>();

  return {
    check(key: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterMs: number } {
      const until = lockedUntil.get(key);
      if (until === undefined || now >= until) return { allowed: true };
      return { allowed: false, retryAfterMs: until - now };
    },

    recordFailure(key: string, now = Date.now()): void {
      const recent = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      if (recent.length >= maxFailures) {
        lockedUntil.set(key, now + lockMs);
        failures.delete(key);
      } else {
        failures.set(key, recent);
      }
    },

    reset(key: string): void {
      failures.delete(key);
      lockedUntil.delete(key);
    },
  };
}

/** 取 x-forwarded-for 的第一段（Vercel 會放真正的用戶端 IP） */
export function clientIp(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0].trim() || "unknown";
}
