import { cacheLife, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, currentSession } from "@/dev/session-stub";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { tagged } from "@/dev/test-helpers";
import { coreNotifications } from "../db/schema";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { cachedFeed, cachedNotificationCounts, cachedNotificationList } = await import("./cached");
const { notify } = await import("../notify");
const { GET, POST } = await import("./api");
const { notificationsCron } = await import("./cron");

const getDb = setupTestDb();
const ORIGIN = "https://hub.example.com";
const TAG = "core:notifications";

const expired = () => vi.mocked(revalidateTag).mock.calls;

const ME = TEST_SESSION.id;

beforeEach(async () => {
  currentSession.mockReset();
  await insertTestUser(getDb(), TEST_SESSION.username, { id: ME, role: "owner" });
  await insertTestUser(getDb(), OTHER_SESSION.username, { id: OTHER_SESSION.id });
});

async function seed(module: string, title: string, readAt: Date | null = null, userId = ME) {
  const [row] = await getDb().insert(coreNotifications).values({ userId, module, kind: "test", title, readAt }).returning();
  return row;
}

describe("通知的快取讀取：標上 core:notifications、用 db 效期", () => {
  it("cachedFeed_未讀數與最近通知", async () => {
    await seed("twitch", "開台了");
    await seed("youtube", "新影片", new Date());

    const feed = await cachedFeed(ME);

    expect(feed.unread).toEqual({ total: 1, byModule: { twitch: 1 } });
    expect(feed.recent.map((n) => n.title)).toEqual(["新影片", "開台了"]);
    expect(tagged()).toEqual([TAG]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedNotificationList_可依模組篩選", async () => {
    await seed("twitch", "開台了");
    await seed("youtube", "新影片");

    expect((await cachedNotificationList(ME, "youtube")).map((n) => n.title)).toEqual(["新影片"]);
    expect((await cachedNotificationList(ME)).map((n) => n.title).sort()).toEqual(["新影片", "開台了"]);
    expect(new Set(tagged())).toEqual(new Set([TAG]));
  });

  it("cachedNotificationCounts_各模組總數與未讀數", async () => {
    await seed("twitch", "開台了");
    await seed("twitch", "看過了", new Date());

    expect(await cachedNotificationCounts(ME)).toEqual({ twitch: { total: 2, unread: 1 } });
    expect(tagged()).toEqual([TAG]);
  });
});

describe("依使用者的快取：使用者 id 是參數，不同人各自一份", () => {
  it("cachedFeed、cachedNotificationList、cachedNotificationCounts 只回傳那個使用者的通知", async () => {
    await seed("twitch", "我的");
    await seed("youtube", "別人的", null, OTHER_SESSION.id);

    expect((await cachedFeed(ME)).recent.map((n) => n.title)).toEqual(["我的"]);
    expect((await cachedFeed(OTHER_SESSION.id)).recent.map((n) => n.title)).toEqual(["別人的"]);
    expect((await cachedNotificationList(ME)).map((n) => n.title)).toEqual(["我的"]);
    expect(await cachedNotificationCounts(OTHER_SESSION.id)).toEqual({ youtube: { total: 1, unread: 1 } });
  });
});

describe("寫入通知的地方都讓 core:notifications 失效（expire: 0）", () => {
  it("notify()_寫入後失效：webhook、排程、after() 都經過這裡", async () => {
    await notify({ recipients: [ME], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(await getDb().select().from(coreNotifications)).toHaveLength(1);
    expect(expired()).toEqual([[TAG, { expire: 0 }]]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("notify() 參數不對_沒寫入也不失效", async () => {
    await expect(notify({ recipients: [ME], module: "Bad Id", kind: "x", title: "t" })).rejects.toThrow();
    expect(expired()).toEqual([]);
  });

  it("notify() 沒有收件人_沒寫入也不失效", async () => {
    await notify({ recipients: [], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(expired()).toEqual([]);
  });

  it("POST /api/notifications 標為已讀_失效後回傳的未讀數已經是新的", async () => {
    const row = await seed("twitch", "開台了");

    const response = await POST(
      new Request(`${ORIGIN}/api/notifications`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ action: "read", ids: [row.id] }),
      }),
    );

    expect((await response.json()).unread.total).toBe(0);
    expect(expired()).toEqual([[TAG, { expire: 0 }]]);
  });

  it("POST 被擋下（不同來源）_沒寫入也不失效", async () => {
    await seed("twitch", "開台了");

    const response = await POST(
      new Request(`${ORIGIN}/api/notifications`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example.com" },
        body: JSON.stringify({ action: "read-all" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(expired()).toEqual([]);
  });

  it("GET /api/notifications（每 10 秒輪詢）_讀快取、不讓任何 tag 失效", async () => {
    await seed("twitch", "開台了");

    const body = await (await GET()).json();

    expect(body.unread.total).toBe(1);
    expect(tagged()).toContain(TAG);
    expect(expired()).toEqual([]);
  });

  it("排程 notifications:cleanup_刪除後失效", async () => {
    await notificationsCron["notifications:cleanup"]();

    expect(expired()).toEqual([[TAG, { expire: 0 }]]);
  });
});
