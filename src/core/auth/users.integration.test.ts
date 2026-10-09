import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreInvites, coreUsers } from "../db/schema";
import { hashPassword, verifyPassword } from "./credentials";

// 包一層 spy，確認帳號不存在時也有呼叫驗證（跑假的 scrypt）
vi.mock("./credentials", { spy: true });

const { authenticate, changePassword, deleteOwnAccount, findSessionUser, hasAnyUser } = await import("./users");

const getDb = setupTestDb();
const FAST = { N: 1024, r: 8, p: 1 };
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "plum blossom 2026";

async function createUser(username = "alice", password = PASSWORD, params = FAST, extra: Partial<typeof coreUsers.$inferInsert> = {}) {
  const [user] = await getDb()
    .insert(coreUsers)
    .values({ username, passwordHash: await hashPassword(password, params), ...extra })
    .returning();
  return user;
}

const createOwner = (username = "owner", extra: Partial<typeof coreUsers.$inferInsert> = {}) => createUser(username, PASSWORD, FAST, { role: "owner", ...extra });

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

  it("新帳號預設是一般成員（member）_沒有停用、沒有登入失敗紀錄", async () => {
    const user = await createUser();

    expect(user.role).toBe("member");
    expect(user.disabledAt).toBeNull();
    expect(user.failedLogins).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("角色只能是 owner 或 member（資料庫也擋）", async () => {
    await expect(createUser("bob", PASSWORD, FAST, { role: "admin" as never })).rejects.toThrow();
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

    expect(await findSessionUser({ userId: user.id, version: 1 })).toEqual({ id: user.id, username: "alice", role: "member" });
  });

  it("帶回資料庫裡的角色（權限一律以資料庫為準，cookie 不帶角色）", async () => {
    const owner = await createOwner();

    expect(await findSessionUser({ userId: owner.id, version: 1 })).toEqual({ id: owner.id, username: "owner", role: "owner" });
  });

  it("帳號已停用_回 null（舊 cookie 立刻失效）", async () => {
    const user = await createUser("alice", PASSWORD, FAST, { disabledAt: new Date() });

    expect(await findSessionUser({ userId: user.id, version: 1 })).toBeNull();
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

  it("新密碼太常見或包含帳號名稱_不變更", async () => {
    const user = await createUser();

    expect(await changePassword(user.id, PASSWORD, "password1234")).toEqual({ ok: false, reason: "invalid", error: "這個密碼太常見，容易被猜到，請換一個" });
    expect(await changePassword(user.id, PASSWORD, "alice-in-wonderland-26")).toEqual({ ok: false, reason: "invalid", error: "密碼不能包含帳號名稱" });
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

// 登入成功會改用正式參數重新雜湊、帳號鎖定時跑的假驗證也用正式參數，scrypt 在機器忙時會超過預設的 5 秒
describe("authenticate：依帳號鎖定（計數存在 core_users，多個執行個體也共用）", { timeout: 30_000 }, () => {
  const T0 = new Date("2026-10-08T00:00:00Z");
  const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
  const WRONG = "wrong password!!";

  async function failTimes(times: number, now: Date) {
    for (let i = 0; i < times; i++) expect(await authenticate("alice", WRONG, now)).toBeNull();
  }

  it("連續錯 5 次就鎖 15 分鐘_鎖定中就算密碼正確也回 null，也不再累加", async () => {
    const user = await createUser();

    await failTimes(5, T0);

    const locked = await userRow(user.id);
    expect(locked.failedLogins).toBe(5);
    expect(locked.lockedUntil).toEqual(later(15));
    expect(await authenticate("alice", PASSWORD, later(14))).toBeNull();
    expect((await userRow(user.id)).failedLogins).toBe(5);
  });

  it("鎖定時間到了_密碼正確就能登入，失敗次數與鎖定都清掉", async () => {
    const user = await createUser();
    await failTimes(5, T0);

    expect(await authenticate("alice", PASSWORD, later(15))).toEqual({ id: user.id, sessionVersion: 1 });

    const after = await userRow(user.id);
    expect(after.failedLogins).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("錯 4 次後登入成功_計數歸零，之後要再連錯 5 次才鎖", async () => {
    const user = await createUser();
    await failTimes(4, T0);
    await authenticate("alice", PASSWORD, T0);

    await failTimes(4, T0);

    expect((await userRow(user.id)).lockedUntil).toBeNull();
    expect(await authenticate("alice", PASSWORD, T0)).toEqual({ id: user.id, sessionVersion: 1 });
  });

  it("鎖定時間逐步拉長：第 10 次錯鎖 30 分鐘、第 15 次起每 5 次鎖 60 分鐘", async () => {
    const user = await createUser();
    const lockAfter = async (now: Date) => {
      await failTimes(5, now);
      return (await userRow(user.id)).lockedUntil;
    };

    expect(await lockAfter(T0)).toEqual(later(15));
    expect(await lockAfter(later(15))).toEqual(later(15 + 30));
    expect(await lockAfter(later(45))).toEqual(later(45 + 60));
    expect(await lockAfter(later(105))).toEqual(later(105 + 60));
  });

  it("鎖定中與帳號不存在一樣：只跑一次假的驗證（null 雜湊），回應時間不透露帳號是否存在", async () => {
    await createUser();
    await failTimes(5, T0);
    vi.mocked(verifyPassword).mockClear();

    expect(await authenticate("alice", PASSWORD, later(1))).toBeNull();

    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
  });

  it("同時送出 20 次錯誤密碼_先占用次數再驗證，最多只真的驗證 5 次，其他都被鎖擋下", async () => {
    const user = await createUser();
    vi.mocked(verifyPassword).mockClear();

    const results = await Promise.all(Array.from({ length: 20 }, () => authenticate("alice", WRONG, T0)));

    expect(results.every((r) => r === null)).toBe(true);
    expect(vi.mocked(verifyPassword).mock.calls.filter(([, stored]) => stored !== null)).toHaveLength(5);
    expect((await userRow(user.id)).failedLogins).toBe(5);
  });

  it("停用的帳號_密碼正確回 disabled（讓登入頁說明已停用），密碼錯誤照樣回 null", async () => {
    const user = await createUser("alice", PASSWORD, FAST, { disabledAt: new Date() });

    expect(await authenticate("alice", PASSWORD, T0)).toEqual({ id: user.id, sessionVersion: 1, disabled: true });
    expect(await authenticate("alice", WRONG, T0)).toBeNull();
  });
});

describe("deleteOwnAccount", () => {
  it("一般成員輸入正確密碼_刪除帳號", async () => {
    await createOwner();
    const member = await createUser();

    expect(await deleteOwnAccount(member.id, PASSWORD)).toEqual({ ok: true });
    expect(await userRow(member.id)).toBeUndefined();
  });

  it("密碼錯誤_不刪除", async () => {
    const member = await createUser();

    expect(await deleteOwnAccount(member.id, "wrong password!!")).toEqual({ ok: false, reason: "wrong_password", error: "密碼不正確" });
    expect(await userRow(member.id)).toBeDefined();
  });

  it("唯一的站長_不能刪除自己", async () => {
    const owner = await createOwner();
    await createUser();

    expect(await deleteOwnAccount(owner.id, PASSWORD)).toEqual({ ok: false, reason: "last_owner", error: "你是唯一的站長，不能刪除自己的帳號" });
    expect(await userRow(owner.id)).toBeDefined();
  });

  it("還有其他站長_可以刪除自己", async () => {
    const owner = await createOwner();
    await createOwner("owner2");

    expect(await deleteOwnAccount(owner.id, PASSWORD)).toEqual({ ok: true });
  });

  it("其他站長都已停用_不能刪除自己（停用的帳號登入不了，沒人能管理）", async () => {
    const owner = await createOwner();
    await createOwner("owner2", { disabledAt: new Date() });

    expect(await deleteOwnAccount(owner.id, PASSWORD)).toMatchObject({ ok: false, reason: "last_owner" });
  });

  it("兩個站長同時刪除自己_至少留下一個站長", async () => {
    const a = await createOwner("owner-a");
    const b = await createOwner("owner-b");

    const results = await Promise.all([deleteOwnAccount(a.id, PASSWORD), deleteOwnAccount(b.id, PASSWORD)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getDb().select().from(coreUsers).where(eq(coreUsers.role, "owner"))).toHaveLength(1);
  });

  it("刪除帳號時_一併刪掉自己建立的邀請", async () => {
    const owner = await createOwner();
    const other = await createOwner("owner2");
    await getDb().insert(coreInvites).values({ tokenHash: "a".repeat(64), createdBy: owner.id, expiresAt: new Date(Date.now() + 86_400_000), maxUses: 1 });

    expect(await deleteOwnAccount(owner.id, PASSWORD)).toEqual({ ok: true });
    expect(await getDb().select().from(coreInvites)).toEqual([]);
    expect(await userRow(other.id)).toBeDefined();
  });

  it("帳號不存在_回 not_found，也跑一次假的驗證", async () => {
    vi.mocked(verifyPassword).mockClear();

    expect(await deleteOwnAccount("6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", PASSWORD)).toMatchObject({ ok: false, reason: "not_found" });
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, null);
  });
});
