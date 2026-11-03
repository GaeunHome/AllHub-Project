import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreModuleDenials, coreUsers } from "../db/schema";

// requireModule 一路經過真的 requireSession 查到 PGlite
// 只把 next/headers 換成假的 cookie

const SECRET = "s".repeat(32);

stubCoreEnv({ SESSION_SECRET: SECRET });

const request = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));

const { canUseModule, deniedModules, requireModule, usableModules } = await import(".");
const { SESSION_COOKIE, signSession } = await import("./session");

const getDb = setupTestDb();
const MODULES = [{ id: "twitch" }, { id: "savings" }, { id: "weather" }];

let owner: string;
let member: string;

const loginAs = async (userId: string) => request.jar.set(SESSION_COOKIE, await signSession({ userId, version: 1 }, SECRET));
const deny = (userId: string, moduleId: string) => getDb().insert(coreModuleDenials).values({ userId, moduleId });

beforeEach(async () => {
  request.jar.clear();
  [owner, member] = await insertTestUsers(getDb());
});

describe("requireModule（PGlite 整合）", () => {
  it("預設全部能用：沒有紀錄的模組回傳目前使用者，之後新增的模組也一樣", async () => {
    await loginAs(member);

    expect(await requireModule("twitch")).toMatchObject({ id: member, username: "bob", role: "member" });
    expect(await requireModule("新模組還沒有人設定過")).toMatchObject({ id: member });
  });

  it("被關掉的模組_導回首頁；別的模組不受影響", async () => {
    await deny(member, "savings");
    await loginAs(member);

    await expect(requireModule("savings")).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    expect(await requireModule("twitch")).toMatchObject({ id: member });
  });

  it("站長一律全部能用：就算資料庫裡有紀錄也不算", async () => {
    await deny(owner, "savings");
    await loginAs(owner);

    expect(await requireModule("savings")).toMatchObject({ id: owner, role: "owner" });
  });

  it("沒登入_導向登入頁，不是首頁", async () => {
    await expect(requireModule("twitch")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("被停用的帳號_導向登入頁", async () => {
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, member));
    await loginAs(member);

    await expect(requireModule("twitch")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("每次都讀最新：關掉後下一次請求就擋，恢復後下一次請求就放行", async () => {
    await loginAs(member);
    expect(await requireModule("savings")).toMatchObject({ id: member });

    await deny(member, "savings");
    await expect(requireModule("savings")).rejects.toThrow(/^NEXT_REDIRECT:\/$/);

    await getDb().delete(coreModuleDenials).where(eq(coreModuleDenials.userId, member));
    expect(await requireModule("savings")).toMatchObject({ id: member });
  });

  it("別人的紀錄不算：同一個模組只關掉這個人", async () => {
    await deny(member, "savings");

    expect(await canUseModule({ id: owner, role: "member" }, "savings")).toBe(true);
    expect(await canUseModule({ id: member, role: "member" }, "savings")).toBe(false);
  });
});

describe("usableModules：只列這個人能用的模組", () => {
  it("拿掉被關掉的模組，順序不變", async () => {
    await deny(member, "savings");
    await loginAs(member);

    expect(await usableModules(MODULES)).toEqual([{ id: "twitch" }, { id: "weather" }]);
  });

  it("站長全部都有", async () => {
    await deny(owner, "savings");
    await loginAs(owner);

    expect(await usableModules(MODULES)).toEqual(MODULES);
  });

  it("沒登入_導向登入頁", async () => {
    await expect(usableModules(MODULES)).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("deniedModules", () => {
  it("成員_回傳被關掉的模組；站長是空的", async () => {
    await deny(member, "savings");
    await deny(owner, "twitch");

    expect([...(await deniedModules({ id: member, role: "member" }))]).toEqual(["savings"]);
    expect([...(await deniedModules({ id: owner, role: "owner" }))]).toEqual([]);
  });
});
