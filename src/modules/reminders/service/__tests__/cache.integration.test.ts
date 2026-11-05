import { cacheLife } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { tagged } from "@/dev/test-helpers";
import { insertItem } from "../../dev/fixtures";
import { cachedReminders } from "../cached";

const getDb = setupTestDb();

describe("提醒的快取", () => {
  it("每人一份（使用者 id 是參數）、照日期排序，標 reminders:items，效期是 db", async () => {
    const [alice, bob] = await insertTestUsers(getDb());
    await insertItem(getDb(), alice, { title: "晚的", date: "2026-12-01" });
    await insertItem(getDb(), alice, { title: "早的", date: "2026-11-05" });
    await insertItem(getDb(), bob, { title: "bob 的", date: "2026-11-06" });

    expect((await cachedReminders(alice)).map((item) => item.title)).toEqual(["早的", "晚的"]);
    expect((await cachedReminders(bob)).map((item) => item.title)).toEqual(["bob 的"]);
    expect([...new Set(tagged())]).toEqual(["reminders:items"]);
    expect(vi.mocked(cacheLife)).toHaveBeenCalledWith("db");
  });

  it("過期還沒刪的也在快取裡：今天要在快取外面過濾，不然過了午夜快取裡的舊資料會多顯示一天", async () => {
    const [alice] = await insertTestUsers(getDb());
    await insertItem(getDb(), alice, { title: "很久以前", date: "2020-01-01" });

    expect((await cachedReminders(alice)).map((item) => item.title)).toEqual(["很久以前"]);
  });
});
