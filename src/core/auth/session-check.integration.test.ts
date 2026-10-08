import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreUsers } from "../db/schema";
import { hashPassword } from "./credentials";

// requireSession 一路走到資料庫（真的 session.ts → users.ts → PGlite），只把 next/headers 換成假的 cookie 來模擬兩台裝置

const SECRET = "s".repeat(32);
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "plum blossom 2026";

stubCoreEnv({ SESSION_SECRET: SECRET });

const request = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { currentSession, requireSession } = await import(".");
const { changePasswordAction } = await import("./actions");
const { SESSION_COOKIE, signSession } = await import("./session");

const getDb = setupTestDb();

async function createUser() {
  const [user] = await getDb()
    .insert(coreUsers)
    .values({ username: "alice", passwordHash: await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 }) })
    .returning();
  return user;
}

const useCookie = (token: string) => request.jar.set(SESSION_COOKIE, token);

beforeEach(() => {
  request.jar.clear();
});

describe("requireSession（PGlite 整合）", () => {
  it("cookie 有效且 session 版本相符_回傳目前使用者", async () => {
    const user = await createUser();
    useCookie(await signSession({ userId: user.id, version: 1 }, SECRET));

    expect(await requireSession()).toEqual({ id: user.id, username: "alice" });
  });

  it("沒有 cookie_導向登入頁", async () => {
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("舊版 cookie（sub: owner，簽章仍正確）_導向登入頁", async () => {
    await createUser();
    useCookie(await new SignJWT({ sub: "owner" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET)));

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("使用者已刪除_導向登入頁", async () => {
    const user = await createUser();
    useCookie(await signSession({ userId: user.id, version: 1 }, SECRET));
    await getDb().delete(coreUsers).where(eq(coreUsers.id, user.id));

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("命令列重設密碼（session 版本遞增）後_舊 cookie 導向登入頁", async () => {
    const user = await createUser();
    useCookie(await signSession({ userId: user.id, version: 1 }, SECRET));
    await getDb().update(coreUsers).set({ sessionVersion: 2 }).where(eq(coreUsers.id, user.id));

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("currentSession 不導向_沒登入回 null（給 API 回 401 用）", async () => {
    expect(await currentSession()).toBeNull();
  });
});

describe("變更密碼（PGlite 整合）", () => {
  it("改密碼後_這台裝置換到新 cookie 繼續登入_其他裝置的舊 cookie 失效", async () => {
    const user = await createUser();
    const otherDevice = await signSession({ userId: user.id, version: 1 }, SECRET);
    useCookie(await signSession({ userId: user.id, version: 1 }, SECRET));
    const form = new FormData();
    form.set("currentPassword", PASSWORD);
    form.set("newPassword", NEW_PASSWORD);
    form.set("confirmPassword", NEW_PASSWORD);

    expect(await changePasswordAction({}, form)).toEqual({ message: "已變更密碼。這台裝置保持登入，其他裝置都已登出。" });

    expect(await requireSession()).toEqual({ id: user.id, username: "alice" });
    useCookie(otherDevice);
    expect(await currentSession()).toBeNull();
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
