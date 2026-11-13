import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { hashPassword } from "../credentials";

const { changePassword, findSessionUser } = await import("../users");

// 這裡會刪欄位 同一個檔案共用一個資料庫 所以獨立一個檔案
const getDb = setupTestDb();

describe("findSessionUser", () => {
  it("部署時新程式比 migration 先上線，資料表還沒有暱稱、頭像與最後上線欄位：登入檢查照常，都當成沒有", async () => {
    const id = await insertTestUser(getDb(), "alice");
    await getDb().execute(sql`alter table core_users drop column nickname, drop column avatar, drop column last_seen_at`);

    expect(await findSessionUser({ userId: id, version: 1 })).toEqual({ id, username: "alice", nickname: null, avatar: null, role: "member", denied: [] });
  });

  it("部署時新程式比 migration 先上線，資料表還沒有最後上線欄位：改密碼照常", async () => {
    await getDb().execute(sql`alter table core_users drop column if exists last_seen_at`);
    // drizzle 的 insert 會列出 schema 的每個欄位 舊的表要直接寫 SQL
    const hash = await hashPassword("Old password 1", { N: 1024, r: 8, p: 1 });
    const { rows } = await getDb().execute<{ id: string }>(sql`insert into core_users (username, password_hash) values ('bob', ${hash}) returning id`);

    expect(await changePassword(rows[0].id, "Old password 1", "New password 2")).toEqual({ ok: true, sessionVersion: 2 });
  });
});
