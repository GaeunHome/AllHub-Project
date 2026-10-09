import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreInvites, coreUsers } from "../db/schema";
import { verifyPassword } from "./credentials";

const { createInvite, generateInviteToken, revokeInvite } = await import("./invites");
const { INVITE_INVALID_MESSAGE, registerMember } = await import("./registration");
const { authenticate } = await import("./users");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const DAY = 86_400_000;
const PASSWORD = "plum blossom 2026";

async function setup({ maxUses = 1, days = 7 } = {}) {
  const [owner] = await getDb().insert(coreUsers).values({ username: "owner", passwordHash: "scrypt$unused", role: "owner" }).returning();
  const invite = await createInvite({ createdBy: owner.id, days, maxUses }, NOW);
  return { owner, ...invite };
}

const input = (code: string, overrides: Partial<{ username: string; password: string; confirmPassword: string }> = {}) => ({
  code,
  username: "bob",
  password: PASSWORD,
  confirmPassword: PASSWORD,
  ...overrides,
});

const userNamed = async (username: string) => (await getDb().select().from(coreUsers).where(eq(coreUsers.username, username)))[0];
const usedCount = async (id: number) => (await getDb().select().from(coreInvites).where(eq(coreInvites.id, id)))[0].usedCount;

describe("registerMember", () => {
  it("有效的邀請_建立一般成員（密碼存 scrypt 雜湊）、邀請已用次數加一_之後可以登入", async () => {
    const { token, id } = await setup();

    const result = await registerMember(input(token, { username: "  Bob " }), NOW);

    const user = await userNamed("bob");
    expect(result).toEqual({ ok: true, id: user.id, sessionVersion: 1 });
    expect(user.role).toBe("member");
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
    expect(await usedCount(id)).toBe(1);
    expect(await authenticate("bob", PASSWORD)).toEqual({ id: user.id, sessionVersion: 1 });
  });

  it.each([
    ["帳號格式不對", { username: "王小明" }, "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）"],
    ["帳號太短", { username: "ab" }, "帳號要 3–32 個字元"],
    ["兩次密碼不一樣", { confirmPassword: `${PASSWORD}!` }, "兩次輸入的密碼不一樣"],
    ["密碼太短", { password: "short", confirmPassword: "short" }, "密碼至少 12 個字元"],
    ["常見密碼", { password: "password1234", confirmPassword: "password1234" }, "這個密碼太常見，容易被猜到，請換一個"],
    ["密碼包含帳號名稱", { password: "bob-the-builder-26", confirmPassword: "bob-the-builder-26" }, "密碼不能包含帳號名稱"],
  ])("%s_不建立帳號、不用掉邀請", async (_name, overrides, error) => {
    const { token, id } = await setup();

    expect(await registerMember(input(token, overrides), NOW)).toEqual({ ok: false, reason: "invalid", error });
    expect(await getDb().select().from(coreUsers)).toHaveLength(1);
    expect(await usedCount(id)).toBe(0);
  });

  it("邀請碼不對、格式不對、過期、撤銷、用完_都回同一句，不建立帳號", async () => {
    const used = await setup({ maxUses: 1 });
    await registerMember(input(used.token, { username: "first" }), NOW);
    const [owner] = await getDb().select().from(coreUsers).where(eq(coreUsers.username, "owner"));
    const revoked = await createInvite({ createdBy: owner.id, days: 7, maxUses: 1 }, NOW);
    await revokeInvite(revoked.id, NOW);
    const expiring = await createInvite({ createdBy: owner.id, days: 1, maxUses: 1 }, NOW);

    const attempts = [
      registerMember(input(generateInviteToken()), NOW),
      registerMember(input("not-a-token"), NOW),
      registerMember(input(expiring.token), new Date(NOW.getTime() + DAY)),
      registerMember(input(revoked.token), NOW),
      registerMember(input(used.token), NOW),
    ];

    for (const result of await Promise.all(attempts)) expect(result).toEqual({ ok: false, reason: "invite", error: INVITE_INVALID_MESSAGE });
    expect(await userNamed("bob")).toBeUndefined();
  });

  it("帳號已經有人用（不分大小寫）_回 taken，而且邀請的使用次數退回（交易整個取消）", async () => {
    const { token, id } = await setup({ maxUses: 5 });
    await registerMember(input(token), NOW);

    expect(await registerMember(input(token, { username: "BOB" }), NOW)).toEqual({ ok: false, reason: "taken", error: "這個帳號已經有人使用，請換一個" });
    expect(await usedCount(id)).toBe(1);
  });

  it("邀請無效時_就算帳號已經有人用也只回邀請無效（沒有有效邀請的人不能用註冊頁查帳號）", async () => {
    await setup();

    expect(await registerMember(input(generateInviteToken(), { username: "owner" }), NOW)).toEqual({ ok: false, reason: "invite", error: INVITE_INVALID_MESSAGE });
  });

  it("同時用只能用 1 次的邀請註冊 5 個帳號_只有 1 個成功", async () => {
    const { token, id } = await setup({ maxUses: 1 });

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => registerMember(input(token, { username: `user${i}` }), NOW)));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "invite")).toHaveLength(4);
    expect(await usedCount(id)).toBe(1);
    expect(await getDb().select().from(coreUsers)).toHaveLength(2);
  });
});
