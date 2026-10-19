import { describe, expect, it } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { DAY_MS } from "./time";
import { coreNotifications } from "./db/schema";

const { deleteExpired } = await import("./retention-cleanup");

const getDb = setupTestDb();
const NOW = new Date("2026-10-21T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe("deleteExpired：通知類紀錄只留 14 天", () => {
  it("照指定的時間欄位刪掉超過 14 天的列，不分擁有者；剛好 14 天的留著", async () => {
    const db = getDb();
    const [alice, bob] = await insertTestUsers(db);
    await db.insert(coreNotifications).values([
      { userId: alice, module: "demo", kind: "demo", title: "alice 的舊通知", createdAt: daysAgo(15) },
      { userId: bob, module: "demo", kind: "demo", title: "bob 的舊通知", createdAt: daysAgo(20) },
      { userId: alice, module: "demo", kind: "demo", title: "剛好 14 天", createdAt: daysAgo(14) },
      // 很久以前建立 最近才讀 照讀取時間算就還在保留期內
      { userId: bob, module: "demo", kind: "demo", title: "最近讀的", createdAt: daysAgo(40), readAt: daysAgo(1) },
    ]);

    expect(await deleteExpired(coreNotifications.readAt, "已讀的通知", NOW)).toBe("刪除 0 筆超過 14 天的已讀的通知");
    expect(await deleteExpired(coreNotifications.createdAt, "網站通知", NOW)).toBe("刪除 3 筆超過 14 天的網站通知");

    expect((await db.select({ title: coreNotifications.title }).from(coreNotifications)).map((row) => row.title)).toEqual(["剛好 14 天"]);
  });
});
