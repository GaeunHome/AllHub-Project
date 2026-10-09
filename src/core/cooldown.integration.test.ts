import { describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { coreRateLimits } from "./db/schema";

const { takeCooldown } = await import("./cooldown");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("takeCooldown：同一個人在冷卻時間內只能做一次（計數存在 core_rate_limits，多個執行個體共用）", () => {
  it("第一次可以做（回 0）；冷卻中再做回還要等幾秒（無條件進位）", async () => {
    const alice = await insertTestUser(getDb(), "alice");

    expect(await takeCooldown("twitch:sync", alice, 60_000, NOW)).toBe(0);
    expect(await takeCooldown("twitch:sync", alice, 60_000, later(15_500))).toBe(45);
    expect(await takeCooldown("twitch:sync", alice, 60_000, later(59_999))).toBe(1);
  });

  it("冷卻時間過了就可以再做", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    await takeCooldown("twitch:sync", alice, 60_000, NOW);

    expect(await takeCooldown("twitch:sync", alice, 60_000, later(60_000))).toBe(0);
  });

  it("不同的人、不同的用途分開算", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    const bob = await insertTestUser(getDb(), "bob");
    await takeCooldown("twitch:sync", alice, 60_000, NOW);

    expect(await takeCooldown("twitch:sync", bob, 60_000, NOW)).toBe(0);
    expect(await takeCooldown("youtube:renew", alice, 60_000, NOW)).toBe(0);
  });

  it("資料庫只存使用者 id 的雜湊", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    await takeCooldown("twitch:sync", alice, 60_000, NOW);

    const rows = await getDb().select().from(coreRateLimits);
    expect(rows).toHaveLength(1);
    expect(rows[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(alice);
  });
});
