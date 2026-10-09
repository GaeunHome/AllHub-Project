import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreInvites, coreUsers } from "../db/schema";

const {
  INVITE_DAY_OPTIONS,
  INVITE_USE_OPTIONS,
  InviteInputError,
  consumeInvite,
  createInvite,
  findUsableInvite,
  generateInviteToken,
  hashInviteToken,
  inviteStatus,
  isInviteToken,
  listInvites,
  revokeInvite,
} = await import("./invites");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const DAY = 86_400_000;
const later = (ms: number) => new Date(NOW.getTime() + ms);

async function createOwner(username = "owner") {
  const [user] = await getDb().insert(coreUsers).values({ username, passwordHash: "scrypt$unused", role: "owner" }).returning();
  return user;
}

async function inviteRow(id: number) {
  return (await getDb().select().from(coreInvites).where(eq(coreInvites.id, id)))[0];
}

describe("邀請碼", () => {
  it("32 bytes 亂數的 base64url（43 個字元）_每次都不同", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("雜湊是 sha256 的 64 個 hex", () => {
    expect(hashInviteToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("isInviteToken 只收 43 個 base64url 字元", () => {
    expect(isInviteToken(generateInviteToken())).toBe(true);
    for (const bad of ["", "abc", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`]) expect(isInviteToken(bad)).toBe(false);
  });

  it("資料庫只存邀請碼的雜湊_整列都找不到原本的邀請碼", async () => {
    const owner = await createOwner();

    const { token, id } = await createInvite({ createdBy: owner.id, days: 7, maxUses: 1 }, NOW);

    const row = await inviteRow(id);
    expect(row.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("createInvite", () => {
  it("期限只能選 1／7／30 天、次數只能選 1／5／10 次", async () => {
    const owner = await createOwner();

    expect(INVITE_DAY_OPTIONS).toEqual([1, 7, 30]);
    expect(INVITE_USE_OPTIONS).toEqual([1, 5, 10]);
    await expect(createInvite({ createdBy: owner.id, days: 2, maxUses: 1 }, NOW)).rejects.toBeInstanceOf(InviteInputError);
    await expect(createInvite({ createdBy: owner.id, days: 7, maxUses: 3 }, NOW)).rejects.toBeInstanceOf(InviteInputError);
    expect(await getDb().select().from(coreInvites)).toEqual([]);
  });

  it("記錄建立者、建立時間、期限、次數上限、已用 0 次與備註", async () => {
    const owner = await createOwner();

    const { id, expiresAt } = await createInvite({ createdBy: owner.id, days: 7, maxUses: 5, note: "  給小明  " }, NOW);

    const row = await inviteRow(id);
    expect(row).toMatchObject({ createdBy: owner.id, createdAt: NOW, expiresAt: later(7 * DAY), maxUses: 5, usedCount: 0, revokedAt: null, note: "給小明" });
    expect(expiresAt).toEqual(later(7 * DAY));
  });

  it("備註最多 50 個字（中文一個字算一個）_空白當成沒有備註", async () => {
    const owner = await createOwner();

    await expect(createInvite({ createdBy: owner.id, days: 1, maxUses: 1, note: "字".repeat(51) }, NOW)).rejects.toThrow("備註最多 50 個字");
    const { id } = await createInvite({ createdBy: owner.id, days: 1, maxUses: 1, note: "   " }, NOW);
    expect((await inviteRow(id)).note).toBeNull();
    expect((await createInvite({ createdBy: owner.id, days: 1, maxUses: 1, note: "字".repeat(50) }, NOW)).id).toBeGreaterThan(0);
  });
});

describe("findUsableInvite 與 consumeInvite", () => {
  async function setup(maxUses = 1, days = 7) {
    const owner = await createOwner();
    return createInvite({ createdBy: owner.id, days, maxUses }, NOW);
  }

  it("有效的邀請_找得到；用一次已用次數加一", async () => {
    const { token, id } = await setup(5);

    expect(await findUsableInvite(token, NOW)).toEqual({ id, expiresAt: later(7 * DAY) });
    expect(await consumeInvite(token, NOW)).toBe(id);
    expect((await inviteRow(id)).usedCount).toBe(1);
  });

  it("過期的邀請（到期那一刻起）_找不到也用不了", async () => {
    const { token, id } = await setup(1, 1);

    expect(await findUsableInvite(token, later(DAY))).toBeNull();
    expect(await consumeInvite(token, later(DAY))).toBeNull();
    expect((await inviteRow(id)).usedCount).toBe(0);
  });

  it("撤銷的邀請_找不到也用不了", async () => {
    const { token, id } = await setup();
    await revokeInvite(id, NOW);

    expect(await findUsableInvite(token, NOW)).toBeNull();
    expect(await consumeInvite(token, NOW)).toBeNull();
  });

  it("次數用完的邀請_找不到也用不了", async () => {
    const { token, id } = await setup(1);
    await consumeInvite(token, NOW);

    expect(await findUsableInvite(token, NOW)).toBeNull();
    expect(await consumeInvite(token, NOW)).toBeNull();
    expect((await inviteRow(id)).usedCount).toBe(1);
  });

  it("邀請碼不對或格式不對_找不到也用不了（格式不對時不查資料庫）", async () => {
    await setup();

    expect(await findUsableInvite(generateInviteToken(), NOW)).toBeNull();
    expect(await consumeInvite(generateInviteToken(), NOW)).toBeNull();
    expect(await findUsableInvite("' or 1=1 --", NOW)).toBeNull();
    expect(await consumeInvite("' or 1=1 --", NOW)).toBeNull();
  });

  it("同時用同一個只能用 1 次的邀請_只有一次成功", async () => {
    const { token, id } = await setup(1);

    const results = await Promise.all(Array.from({ length: 6 }, () => consumeInvite(token, NOW)));

    expect(results.filter((r) => r !== null)).toEqual([id]);
    expect((await inviteRow(id)).usedCount).toBe(1);
  });

  it("同時用可以用 5 次的邀請 8 次_剛好成功 5 次", async () => {
    const { token, id } = await setup(5);

    const results = await Promise.all(Array.from({ length: 8 }, () => consumeInvite(token, NOW)));

    expect(results.filter((r) => r !== null)).toHaveLength(5);
    expect((await inviteRow(id)).usedCount).toBe(5);
  });

  it("資料庫也擋下已用次數超過上限（程式漏檢查時的最後防線）", async () => {
    const { id } = await setup(1);

    await expect(getDb().update(coreInvites).set({ usedCount: 2 }).where(eq(coreInvites.id, id))).rejects.toThrow();
  });
});

describe("inviteStatus", () => {
  const base = { expiresAt: later(DAY), maxUses: 5, usedCount: 0, revokedAt: null };

  it.each([
    ["有效", base, "active"],
    ["到期那一刻起算過期", { ...base, expiresAt: NOW }, "expired"],
    ["次數用完", { ...base, usedCount: 5 }, "used_up"],
    ["撤銷（就算也過期或用完）", { ...base, revokedAt: NOW, usedCount: 5, expiresAt: NOW }, "revoked"],
    ["用完又過期_算用完", { ...base, usedCount: 5, expiresAt: NOW }, "used_up"],
  ] as const)("%s", (_name, invite, status) => {
    expect(inviteStatus(invite, NOW)).toBe(status);
  });
});

describe("listInvites", () => {
  it("新的在前_帶建立者的帳號名稱_不含邀請碼雜湊", async () => {
    const owner = await createOwner();
    const first = await createInvite({ createdBy: owner.id, days: 1, maxUses: 1, note: "第一個" }, NOW);
    const second = await createInvite({ createdBy: owner.id, days: 7, maxUses: 5 }, later(1000));

    const list = await listInvites();

    expect(list.map((i) => i.id)).toEqual([second.id, first.id]);
    expect(list[1]).toEqual({
      id: first.id,
      note: "第一個",
      createdBy: "owner",
      createdAt: NOW,
      expiresAt: later(DAY),
      maxUses: 1,
      usedCount: 0,
      revokedAt: null,
    });
    expect(JSON.stringify(list)).not.toContain("tokenHash");
  });
});

describe("revokeInvite", () => {
  it("記下撤銷時間_已經撤銷或不存在時回 false", async () => {
    const owner = await createOwner();
    const { id } = await createInvite({ createdBy: owner.id, days: 7, maxUses: 1 }, NOW);

    expect(await revokeInvite(id, later(1000))).toBe(true);
    expect((await inviteRow(id)).revokedAt).toEqual(later(1000));
    expect(await revokeInvite(id, later(2000))).toBe(false);
    expect((await inviteRow(id)).revokedAt).toEqual(later(1000));
    expect(await revokeInvite(99999, NOW)).toBe(false);
  });
});
