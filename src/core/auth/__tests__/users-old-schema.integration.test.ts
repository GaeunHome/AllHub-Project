import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";

const { findSessionUser } = await import("../users");

// 這裡會刪欄位 同一個檔案共用一個資料庫 所以獨立一個檔案
const getDb = setupTestDb();

describe("findSessionUser", () => {
  it("部署時新程式比 migration 先上線，資料表還沒有暱稱與頭像欄位：登入檢查照常，都當成沒有", async () => {
    const id = await insertTestUser(getDb(), "alice");
    await getDb().execute(sql`alter table core_users drop column nickname, drop column avatar`);

    expect(await findSessionUser({ userId: id, version: 1 })).toEqual({ id, username: "alice", nickname: null, avatar: null, role: "member", denied: [] });
  });
});
