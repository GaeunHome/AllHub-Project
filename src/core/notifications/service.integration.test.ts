import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreNotifications } from "../db/schema";
import {
  cleanupNotifications,
  listNotifications,
  loadFeed,
  markAllNotificationsRead,
  markNotificationsRead,
  notificationCounts,
  recentNotifications,
  unreadSummary,
} from "./service";

const NOW = new Date("2026-10-21T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000);
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const getDb = setupTestDb();

type Seed = Partial<typeof coreNotifications.$inferInsert> & { module: string };
async function seed(...items: Seed[]) {
  return getDb()
    .insert(coreNotifications)
    .values(items.map((item, i) => ({ kind: "test", title: `通知 ${i + 1}`, createdAt: minutesAgo(items.length - i), ...item })))
    .returning();
}

describe("unreadSummary", () => {
  it("依模組計算未讀數_已讀的與超過保留期的不算", async () => {
    await seed(
      { module: "twitch" },
      { module: "twitch" },
      { module: "youtube" },
      { module: "youtube", readAt: minutesAgo(1) },
      { module: "starrail", createdAt: daysAgo(15) },
    );

    expect(await unreadSummary(NOW)).toEqual({ total: 3, byModule: { twitch: 2, youtube: 1 } });
  });

  it("沒有通知_總數 0", async () => {
    expect(await unreadSummary(NOW)).toEqual({ total: 0, byModule: {} });
  });
});

describe("recentNotifications", () => {
  it("最新的在前_最多 limit 筆_時間是 ISO 字串、read 是布林", async () => {
    const [first, , third] = await seed(
      { module: "twitch", title: "最舊", body: "內容", url: "https://twitch.tv/alice" },
      { module: "youtube", title: "中間" },
      { module: "starrail", title: "最新", readAt: minutesAgo(0) },
    );

    const recent = await recentNotifications(2, NOW);

    expect(recent.map((n) => n.title)).toEqual(["最新", "中間"]);
    expect(recent[0]).toEqual({
      id: third.id,
      module: "starrail",
      kind: "test",
      title: "最新",
      body: "",
      url: null,
      createdAt: third.createdAt.toISOString(),
      read: true,
    });
    expect((await recentNotifications(10, NOW)).at(-1)).toMatchObject({ id: first.id, url: "https://twitch.tv/alice", read: false });
  });

  it("超過保留期（14 天）的不列出", async () => {
    await seed({ module: "twitch", title: "舊的", createdAt: daysAgo(15) }, { module: "twitch", title: "新的" });

    expect((await recentNotifications(10, NOW)).map((n) => n.title)).toEqual(["新的"]);
  });
});

describe("loadFeed", () => {
  it("一次帶回未讀數與最近 10 筆", async () => {
    await seed(...Array.from({ length: 12 }, () => ({ module: "twitch" })));

    const feed = await loadFeed(NOW);

    expect(feed.unread).toEqual({ total: 12, byModule: { twitch: 12 } });
    expect(feed.recent).toHaveLength(10);
  });
});

describe("listNotifications", () => {
  it("列出保留期內的全部通知（最新在前）_可以只看某個模組", async () => {
    await seed({ module: "twitch", title: "T1" }, { module: "youtube", title: "Y1" }, { module: "twitch", title: "T2" }, { module: "twitch", title: "過期", createdAt: daysAgo(20) });

    expect((await listNotifications({ now: NOW })).map((n) => n.title)).toEqual(["T2", "Y1", "T1"]);
    expect((await listNotifications({ module: "twitch", now: NOW })).map((n) => n.title)).toEqual(["T2", "T1"]);
  });
});

describe("notificationCounts", () => {
  it("每個模組的總數與未讀數（篩選按鈕用）", async () => {
    await seed({ module: "twitch" }, { module: "twitch", readAt: minutesAgo(1) }, { module: "youtube" }, { module: "starrail", createdAt: daysAgo(30) });

    expect(await notificationCounts(NOW)).toEqual({ twitch: { total: 2, unread: 1 }, youtube: { total: 1, unread: 1 } });
  });
});

describe("markNotificationsRead", () => {
  it("只把指定的標成已讀_已經讀過的不改時間_回傳這次標記的筆數", async () => {
    const earlier = minutesAgo(30);
    const [a, b, c] = await seed({ module: "twitch" }, { module: "twitch", readAt: earlier }, { module: "youtube" });

    expect(await markNotificationsRead([a.id, b.id], NOW)).toBe(1);

    const byId = new Map((await getDb().select().from(coreNotifications)).map((n) => [n.id, n]));
    expect(byId.get(a.id)!.readAt).toEqual(NOW);
    expect(byId.get(b.id)!.readAt).toEqual(earlier);
    expect(byId.get(c.id)!.readAt).toBeNull();
  });

  it("空陣列_什麼都不做", async () => {
    expect(await markNotificationsRead([], NOW)).toBe(0);
  });
});

describe("markAllNotificationsRead", () => {
  it("全部標成已讀", async () => {
    await seed({ module: "twitch" }, { module: "youtube" });

    expect(await markAllNotificationsRead(undefined, NOW)).toBe(2);
    expect(await unreadSummary(NOW)).toEqual({ total: 0, byModule: {} });
  });

  it("指定模組_只標那個模組", async () => {
    await seed({ module: "twitch" }, { module: "youtube" });

    expect(await markAllNotificationsRead("twitch", NOW)).toBe(1);
    expect(await unreadSummary(NOW)).toEqual({ total: 1, byModule: { youtube: 1 } });
  });
});

describe("cleanupNotifications", () => {
  it("刪除超過 14 天的通知（已讀未讀都刪）_其他留著", async () => {
    await seed(
      { module: "twitch", title: "old", createdAt: daysAgo(15) },
      { module: "twitch", title: "old-read", createdAt: daysAgo(16), readAt: daysAgo(16) },
      { module: "twitch", title: "edge", createdAt: daysAgo(14) },
      { module: "twitch", title: "new", createdAt: daysAgo(1) },
    );

    expect(await cleanupNotifications(NOW)).toBe("刪除 2 筆超過 14 天的網站通知");

    const left = await getDb().select({ title: coreNotifications.title }).from(coreNotifications);
    expect(left.map((n) => n.title).sort()).toEqual(["edge", "new"]);
  });
});
