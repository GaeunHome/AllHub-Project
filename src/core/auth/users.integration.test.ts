import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreUsers } from "../db/schema";
import { hashPassword, verifyPassword } from "./credentials";

// 包一層 spy，確認帳號不存在時也有呼叫驗證（跑假的 scrypt）
vi.mock("./credentials", { spy: true });

const { authenticate, changePassword, findSessionUser, hasAnyUser } = await import("./users");

const getDb = setupTestDb();
const FAST = { N: 1024, r: 8, p: 1 };
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "plum blossom 2026";

async function createUser(username = "alice", password = PASSWORD, params = FAST) {
  const [user] = await getDb()
    .insert(coreUsers)
    .values({ username, passwordHash: await hashPassword(password, params) })
    .returning();
  return user;
}

const userRow = async (id: string) => (await getDb().select().from(coreUsers).where(eq(coreUsers.id, id)))[0];

beforeEach(() => {
  vi.mocked(verifyPassword).mockClear();
});

describe("core_users 資料表", () => {
  it("id 是 UUID_session 版本從 1 開始_記錄建立與更新時間", async () => {
    const user = await createUser();

    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(user.sessionVersion).toBe(1);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("帳號不能重複", async () => {
    await createUser("alice");
    await expect(createUser("alice")).rejects.toThrow();
  });

  it.each(["Alice", "ab", "has space", "x".repeat(33)])("資料庫也擋下不合規則的帳號（%s）", async (username) => {
    await expect(createUser(username)).rejects.toThrow();
  });
});

describe("authenticate", () => {
  it("帳號密碼正確_回傳使用者 id 與 session 版本", async () => {
    const user = await createUser();

    expect(await authenticate("alice", PASSWORD)).toEqual({ id: user.id, sessionVersion: 1 });
  });

  it("帳號不分大小寫、前後空白不影響", async () => {
    const user = await createUser();

    expect(await authenticate("  ALICE ", PASSWORD)).toEqual({ id: user.id, sessionVersion: 1 });
  });

  it("密碼錯誤_回 null", async () => {
    await createUser();

    expect(await authenticate("alice", "wrong password!!")).toBeNull();
  });

  it("帳號不存在_回 null_一樣驗證一次密碼（假的雜湊），回應時間不透露帳號是否存在", async () => {
    await createUser();

    expect(await authenticate("nobody", PASSWORD)).toBeNull();
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
  });

  it("帳號格式不對_回 null_也跑一次假的驗證", async () => {
    expect(await authenticate("has space", PASSWORD)).toBeNull();
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
  });

  it("雜湊參數不是目前的預設值_登入成功後改用目前參數重新雜湊_session 版本不變", async () => {
    const user = await createUser();

    await authenticate("alice", PASSWORD);

    const after = await userRow(user.id);
    expect(after.passwordHash).not.toBe(user.passwordHash);
    expect(after.passwordHash.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(after.sessionVersion).toBe(1);
    expect(await authenticate("alice", PASSWORD)).toEqual({ id: user.id, sessionVersion: 1 });
  });
});

describe("findSessionUser", () => {
  it("id 與 session 版本都相符_回傳使用者", async () => {
    const user = await createUser();

    expect(await findSessionUser({ userId: user.id, version: 1 })).toEqual({ id: user.id, username: "alice" });
  });

  it("版本不符（改過密碼）_回 null", async () => {
    const user = await createUser();

    expect(await findSessionUser({ userId: user.id, version: 2 })).toBeNull();
  });

  it("使用者已刪除_回 null", async () => {
    const user = await createUser();
    await getDb().delete(coreUsers).where(eq(coreUsers.id, user.id));

    expect(await findSessionUser({ userId: user.id, version: 1 })).toBeNull();
  });
});

describe("hasAnyUser", () => {
  it("還沒建立帳號_false；建立後_true", async () => {
    expect(await hasAnyUser()).toBe(false);
    await createUser();
    expect(await hasAnyUser()).toBe(true);
  });
});

describe("changePassword", () => {
  it("目前密碼正確_換成新密碼並遞增 session 版本", async () => {
    const user = await createUser();

    expect(await changePassword(user.id, PASSWORD, NEW_PASSWORD)).toEqual({ ok: true, sessionVersion: 2 });

    const after = await userRow(user.id);
    expect(after.sessionVersion).toBe(2);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(user.updatedAt.getTime());
    expect(await authenticate("alice", NEW_PASSWORD)).toEqual({ id: user.id, sessionVersion: 2 });
    expect(await authenticate("alice", PASSWORD)).toBeNull();
  });

  it("新密碼用目前的預設參數雜湊", async () => {
    const user = await createUser();

    await changePassword(user.id, PASSWORD, NEW_PASSWORD);

    expect((await userRow(user.id)).passwordHash.startsWith("scrypt$32768$8$3$")).toBe(true);
  });

  it("目前密碼錯誤_不變更", async () => {
    const user = await createUser();

    expect(await changePassword(user.id, "wrong password!!", NEW_PASSWORD)).toEqual({
      ok: false,
      reason: "wrong_password",
      error: "目前的密碼不正確",
    });
    expect((await userRow(user.id)).sessionVersion).toBe(1);
  });

  it("新密碼不合規則_不變更", async () => {
    const user = await createUser();

    expect(await changePassword(user.id, PASSWORD, "short")).toEqual({ ok: false, reason: "invalid", error: "密碼至少 12 個字元" });
    expect((await userRow(user.id)).passwordHash).toBe(user.passwordHash);
  });

  it("新密碼跟目前的一樣_不變更", async () => {
    const user = await createUser();

    expect(await changePassword(user.id, PASSWORD, PASSWORD)).toEqual({ ok: false, reason: "invalid", error: "新密碼不能跟目前的密碼一樣" });
    expect((await userRow(user.id)).sessionVersion).toBe(1);
  });

  it("使用者不存在_不變更", async () => {
    expect(await changePassword("6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", PASSWORD, NEW_PASSWORD)).toMatchObject({ ok: false, reason: "not_found" });
  });
});
