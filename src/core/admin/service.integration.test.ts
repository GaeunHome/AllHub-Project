import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { hashPassword } from "../auth/credentials";
import { coreInvites, coreUsers } from "../db/schema";

const { AdminUserError, deleteUser, listLockedUsers, listUsers, setUserDisabled, unlockUser } = await import("./service");
const { authenticate, findSessionUser } = await import("../auth/users");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");

async function createUser(username: string, extra: Partial<typeof coreUsers.$inferInsert> = {}) {
  const [user] = await getDb()
    .insert(coreUsers)
    .values({ username, passwordHash: "scrypt$secret-hash", ...extra })
    .returning();
  return user;
}

const userRow = async (id: string) => (await getDb().select().from(coreUsers).where(eq(coreUsers.id, id)))[0];

describe("listUsers", () => {
  it("依建立時間排列_只有帳號、角色、建立時間與停用時間，不含密碼雜湊", async () => {
    const owner = await createUser("owner", { role: "owner", createdAt: new Date("2026-01-01T00:00:00Z") });
    const bob = await createUser("bob", { createdAt: new Date("2026-02-01T00:00:00Z"), disabledAt: NOW });

    expect(await listUsers()).toEqual([
      { id: owner.id, username: "owner", role: "owner", createdAt: new Date("2026-01-01T00:00:00Z"), disabledAt: null },
      { id: bob.id, username: "bob", role: "member", createdAt: new Date("2026-02-01T00:00:00Z"), disabledAt: NOW },
    ]);
    expect(JSON.stringify(await listUsers())).not.toContain("secret-hash");
  });
});

describe("setUserDisabled", () => {
  it("停用_記下時間；恢復_清掉", async () => {
    const owner = await createUser("owner", { role: "owner" });
    const bob = await createUser("bob");

    expect(await setUserDisabled(owner.id, bob.id, true, NOW)).toBe(true);
    expect((await userRow(bob.id)).disabledAt).toEqual(NOW);
    expect(await setUserDisabled(owner.id, bob.id, false, NOW)).toBe(true);
    expect((await userRow(bob.id)).disabledAt).toBeNull();
  });

  it("停用時 session 版本加一：恢復之後，停用前簽發的舊 cookie 也不能再用", async () => {
    const owner = await createUser("owner", { role: "owner" });
    const bob = await createUser("bob", { sessionVersion: 3 });
    expect(await findSessionUser({ userId: bob.id, version: 3 })).not.toBeNull();

    await setUserDisabled(owner.id, bob.id, true, NOW);
    expect((await userRow(bob.id)).sessionVersion).toBe(4);
    await setUserDisabled(owner.id, bob.id, false, NOW);

    expect((await userRow(bob.id)).sessionVersion).toBe(4);
    expect(await findSessionUser({ userId: bob.id, version: 3 })).toBeNull();
  });

  it("不能停用自己", async () => {
    const owner = await createUser("owner", { role: "owner" });

    await expect(setUserDisabled(owner.id, owner.id, true, NOW)).rejects.toThrow(new AdminUserError("不能停用自己的帳號"));
    expect((await userRow(owner.id)).disabledAt).toBeNull();
  });

  it("帳號不存在_回 false", async () => {
    const owner = await createUser("owner", { role: "owner" });

    expect(await setUserDisabled(owner.id, "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", true, NOW)).toBe(false);
  });
});

describe("deleteUser", () => {
  it("刪除帳號_連同他建立的邀請", async () => {
    const owner = await createUser("owner", { role: "owner" });
    const other = await createUser("owner2", { role: "owner" });
    await getDb().insert(coreInvites).values({ tokenHash: "b".repeat(64), createdBy: other.id, expiresAt: NOW, maxUses: 1 });

    expect(await deleteUser(owner.id, other.id)).toBe(true);
    expect(await userRow(other.id)).toBeUndefined();
    expect(await getDb().select().from(coreInvites)).toEqual([]);
  });

  it("不能刪除自己（要刪除自己的帳號請到帳號頁）", async () => {
    const owner = await createUser("owner", { role: "owner" });

    await expect(deleteUser(owner.id, owner.id)).rejects.toThrow(new AdminUserError("不能在管理頁刪除自己的帳號"));
    expect(await userRow(owner.id)).toBeDefined();
  });

  it("帳號不存在_回 false", async () => {
    const owner = await createUser("owner", { role: "owner" });

    expect(await deleteUser(owner.id, "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f")).toBe(false);
  });
});

describe("listLockedUsers", () => {
  it("只列出鎖定還沒到期的帳號與鎖定期限", async () => {
    const locked = await createUser("alice", { lockedUntil: new Date(NOW.getTime() + 10 * 60_000), failedLogins: 5 });
    await createUser("bob", { lockedUntil: new Date(NOW.getTime() - 1), failedLogins: 5 });
    await createUser("carol");

    expect(await listLockedUsers(NOW)).toEqual([{ id: locked.id, lockedUntil: new Date(NOW.getTime() + 10 * 60_000) }]);
  });
});

// 解除鎖定後的登入會用正式參數重新雜湊，scrypt 在機器忙時會超過預設的 5 秒
describe("unlockUser", { timeout: 30_000 }, () => {
  it("只把失敗次數歸零、清掉鎖定期限；密碼雜湊、停用狀態與 session 版本都不變", async () => {
    const bob = await createUser("bob", { failedLogins: 7, lockedUntil: new Date(Date.now() + 3_600_000), disabledAt: NOW, sessionVersion: 3 });

    expect(await unlockUser(bob.id)).toBe(true);

    const after = await userRow(bob.id);
    expect(after).toMatchObject({ failedLogins: 0, lockedUntil: null, passwordHash: bob.passwordHash, disabledAt: NOW, sessionVersion: 3 });
  });

  it("帳號不存在_回 false", async () => {
    expect(await unlockUser("6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f")).toBe(false);
  });

  it("解除鎖定之後_可以用正確密碼登入", async () => {
    const password = "plum blossom 2026";
    const bob = await createUser("bob", { passwordHash: await hashPassword(password, { N: 1024, r: 8, p: 1 }) });
    for (let i = 0; i < 5; i++) await authenticate("bob", "wrong password!!");
    expect(await authenticate("bob", password)).toBeNull();

    expect(await unlockUser(bob.id)).toBe(true);

    expect(await authenticate("bob", password)).toEqual({ id: bob.id, sessionVersion: 1 });
  });
});
