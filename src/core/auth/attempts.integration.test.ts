import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreRateLimits } from "../db/schema";

stubCoreEnv();

const { INVITE_FAILURES, REGISTER_ATTEMPTS, checkAttempts, clientKey, recordAttempt } = await import("./attempts");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const MIN = 60_000;
const later = (ms: number) => new Date(NOW.getTime() + ms);
const RULE = { scope: "demo", max: 3, windowMs: 10 * MIN };
const IP = "203.0.113.7";

describe("clientKey：IP 只存雜湊", () => {
  it("同一個 IP 每次都一樣；不同 IP 不一樣；是 64 個 hex，看不出原本的 IP", () => {
    const key = clientKey(IP);

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(clientKey(IP)).toBe(key);
    expect(clientKey("203.0.113.8")).not.toBe(key);
    expect(key).not.toContain("203");
  });

  it("用伺服器的密鑰加料：拿到資料庫也沒辦法把 40 億個 IPv4 逐一算出來比對", () => {
    expect(clientKey(IP, "a".repeat(32))).not.toBe(clientKey(IP, "b".repeat(32)));
  });
});

describe("recordAttempt：每次嘗試都記一筆（計數存在資料庫，多個執行個體共用）", () => {
  it("時間窗內前 max 次放行_之後擋下並告訴還要等多久", async () => {
    const key = clientKey(IP);
    for (let i = 0; i < 3; i++) expect(await recordAttempt(RULE, key, later(i * MIN))).toEqual({ allowed: true });

    expect(await recordAttempt(RULE, key, later(4 * MIN))).toEqual({ allowed: false, retryAfterMs: 6 * MIN });
  });

  it("時間窗過了就重新計算", async () => {
    const key = clientKey(IP);
    for (let i = 0; i < 4; i++) await recordAttempt(RULE, key, NOW);

    expect(await recordAttempt(RULE, key, later(10 * MIN))).toEqual({ allowed: true });
    const [row] = await getDb().select().from(coreRateLimits);
    expect(row.attempts).toBe(1);
    expect(row.windowStartedAt).toEqual(later(10 * MIN));
  });

  it("不同 IP、不同用途分開計算", async () => {
    for (let i = 0; i < 4; i++) await recordAttempt(RULE, clientKey(IP), NOW);

    expect(await recordAttempt(RULE, clientKey("198.51.100.1"), NOW)).toEqual({ allowed: true });
    expect(await recordAttempt({ ...RULE, scope: "other" }, clientKey(IP), NOW)).toEqual({ allowed: true });
  });

  it("同時送出 12 次_一次都不會少算（單一 upsert 在資料庫裡加一），剛好放行 max 次", async () => {
    const key = clientKey(IP);

    const gates = await Promise.all(Array.from({ length: 12 }, () => recordAttempt(RULE, key, NOW)));

    expect(gates.filter((g) => g.allowed)).toHaveLength(3);
    const [row] = await getDb().select().from(coreRateLimits);
    expect(row.attempts).toBe(12);
  });

  it("資料庫裡沒有原本的 IP", async () => {
    await recordAttempt(RULE, clientKey(IP), NOW);

    expect(JSON.stringify(await getDb().select().from(coreRateLimits))).not.toContain(IP);
  });

  it("順便清掉一天以前的舊紀錄（不必另外排程）", async () => {
    await getDb().insert(coreRateLimits).values({ scope: "demo", keyHash: "old", windowStartedAt: later(-25 * 60 * MIN), attempts: 9 });

    await recordAttempt(RULE, clientKey(IP), NOW);

    expect((await getDb().select().from(coreRateLimits)).map((r) => r.keyHash)).toEqual([clientKey(IP)]);
  });
});

describe("checkAttempts：只看不記（邀請碼失敗才記）", () => {
  it("還沒達到上限_放行而且不增加次數；達到上限_擋下", async () => {
    const key = clientKey(IP);
    await recordAttempt(RULE, key, NOW);
    await recordAttempt(RULE, key, NOW);

    expect(await checkAttempts(RULE, key, NOW)).toEqual({ allowed: true });
    expect(await checkAttempts(RULE, key, NOW)).toEqual({ allowed: true });
    await recordAttempt(RULE, key, NOW);
    expect(await checkAttempts(RULE, key, later(MIN))).toEqual({ allowed: false, retryAfterMs: 9 * MIN });
  });

  it("時間窗過了_放行", async () => {
    const key = clientKey(IP);
    for (let i = 0; i < 3; i++) await recordAttempt(RULE, key, NOW);

    expect(await checkAttempts(RULE, key, later(10 * MIN))).toEqual({ allowed: true });
  });

  it("沒有紀錄_放行", async () => {
    expect(await checkAttempts(RULE, clientKey(IP), NOW)).toEqual({ allowed: true });
  });
});

describe("註冊用的上限", () => {
  it("註冊：同一個 IP 每小時最多 10 次；邀請碼錯誤：每小時最多 10 次", () => {
    expect(REGISTER_ATTEMPTS).toEqual({ scope: "register", max: 10, windowMs: 60 * MIN });
    expect(INVITE_FAILURES).toEqual({ scope: "invite", max: 10, windowMs: 60 * MIN });
  });
});
