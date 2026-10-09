import { cacheLife } from "next/cache";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { tagged } from "@/dev/test-helpers";
import { coreInvites, coreUsers } from "../db/schema";

const { cachedInvites, cachedUsers } = await import("./cached");

const getDb = setupTestDb();

async function seed() {
  const [owner] = await getDb().insert(coreUsers).values({ username: "owner", passwordHash: "scrypt$secret-hash", role: "owner" }).returning();
  await getDb()
    .insert(coreInvites)
    .values({ tokenHash: "f".repeat(64), createdBy: owner.id, expiresAt: new Date("2026-10-15T00:00:00Z"), maxUses: 5, note: "給小明" });
  return owner;
}

describe("管理頁的快取讀取：標上讀到的資料表、用 db 效期、不含密碼雜湊與邀請碼雜湊", () => {
  it("cachedUsers_標上 core:users", async () => {
    await seed();

    const users = await cachedUsers();

    expect(users.map((u) => u.username)).toEqual(["owner"]);
    expect(tagged()).toEqual(["core:users"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
    expect(JSON.stringify(users)).not.toContain("secret-hash");
  });

  it("cachedInvites_標上 core:invites 與 core:users（建立者的帳號名稱來自 core_users）", async () => {
    await seed();

    const invites = await cachedInvites();

    expect(invites.map((i) => [i.note, i.createdBy])).toEqual([["給小明", "owner"]]);
    expect(tagged()).toEqual(["core:invites", "core:users"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
    expect(JSON.stringify(invites)).not.toContain("f".repeat(64));
  });
});
