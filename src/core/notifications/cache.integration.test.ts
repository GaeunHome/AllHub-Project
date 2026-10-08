import { cacheLife, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentSession } from "@/dev/session-stub";
import { setupTestDb } from "@/dev/test-db";
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

beforeEach(() => {
  currentSession.mockReset();
});

async function seed(module: string, title: string, readAt: Date | null = null) {
  const [row] = await getDb().insert(coreNotifications).values({ module, kind: "test", title, readAt }).returning();
  return row;
}

describe("通知的快取讀取：標上 core:notifications、用 db 效期", () => {
  it("cachedFeed_未讀數與最近通知", async () => {
    await seed("twitch", "開台了");
    await seed("youtube", "新影片", new Date());

    const feed = await cachedFeed();

    expect(feed.unread).toEqual({ total: 1, byModule: { twitch: 1 } });
    expect(feed.recent.map((n) => n.title)).toEqual(["新影片", "開台了"]);
    expect(tagged()).toEqual([TAG]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedNotificationList_可依模組篩選", async () => {
    await seed("twitch", "開台了");
    await seed("youtube", "新影片");

    expect((await cachedNotificationList("youtube")).map((n) => n.title)).toEqual(["新影片"]);
    expect((await cachedNotificationList()).map((n) => n.title).sort()).toEqual(["新影片", "開台了"]);
    expect(new Set(tagged())).toEqual(new Set([TAG]));
  });

  it("cachedNotificationCounts_各模組總數與未讀數", async () => {
    await seed("twitch", "開台了");
    await seed("twitch", "看過了", new Date());

    expect(await cachedNotificationCounts()).toEqual({ twitch: { total: 2, unread: 1 } });
    expect(tagged()).toEqual([TAG]);
  });
});

describe("寫入通知的地方都讓 core:notifications 失效（expire: 0）", () => {
  it("notify()_寫入後失效：webhook、排程、after() 都經過這裡", async () => {
    await notify({ module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(await getDb().select().from(coreNotifications)).toHaveLength(1);
    expect(expired()).toEqual([[TAG, { expire: 0 }]]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("notify() 參數不對_沒寫入也不失效", async () => {
    await expect(notify({ module: "Bad Id", kind: "x", title: "t" })).rejects.toThrow();
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
