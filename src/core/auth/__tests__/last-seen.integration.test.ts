import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreUsers } from "../../db/schema";

// 經過真的 currentSession 查到 PGlite 回應送出後才做的事先收起來 測試自己跑

const SECRET = "s".repeat(32);
const HOUR = 3_600_000;

stubCoreEnv({ SESSION_SECRET: SECRET });

const request = vi.hoisted(() => ({ jar: new Map<string, string>(), later: [] as (() => unknown)[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)! } : undefined) }),
}));
vi.mock("next/server", () => ({ connection: async () => {}, after: (task: () => unknown) => void request.later.push(task) }));

const { currentSession } = await import("..");
const { SESSION_COOKIE, signSession } = await import("../session");

const getDb = setupTestDb();

async function signIn(lastSeenAt: Date | null): Promise<string> {
  const id = await insertTestUser(getDb(), "alice");
  await getDb().update(coreUsers).set({ lastSeenAt }).where(eq(coreUsers.id, id));
  request.jar.set(SESSION_COOKIE, await signSession({ userId: id, version: 1 }, SECRET));
  return id;
}

/** 打開一頁 回應送出後的事也做完 */
async function visit(): Promise<void> {
  await currentSession();
  await Promise.all(request.later.splice(0).map((task) => task()));
}

const lastSeenOf = async (id: string) => (await getDb().select({ at: coreUsers.lastSeenAt }).from(coreUsers).where(eq(coreUsers.id, id)))[0].at;

beforeEach(() => {
  request.jar.clear();
  request.later.length = 0;
});

describe("最後上線時間（使用者要的：站長在管理頁看每個成員多久沒來）", () => {
  it("還沒有紀錄的人打開網站_記下現在的時間", async () => {
    const id = await signIn(null);
    const before = Date.now();

    await visit();

    const seen = (await lastSeenOf(id))!.getTime();
    expect(seen).toBeGreaterThanOrEqual(before);
    expect(seen).toBeLessThanOrEqual(Date.now());
  });

  it("每小時最多記一次：一小時內再打開不重寫", async () => {
    const earlier = new Date(Date.now() - HOUR / 2);
    const id = await signIn(earlier);

    await visit();

    expect(await lastSeenOf(id)).toEqual(earlier);
  });

  it("超過一小時再打開_更新成現在", async () => {
    const id = await signIn(new Date(Date.now() - 2 * HOUR));
    const before = Date.now();

    await visit();

    expect((await lastSeenOf(id))!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("沒登入時不記任何人", async () => {
    const id = await insertTestUser(getDb(), "alice");

    await visit();

    expect(await lastSeenOf(id)).toBeNull();
  });
});
