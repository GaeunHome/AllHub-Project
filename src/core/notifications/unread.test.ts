import { describe, expect, it } from "vitest";
import type { NotificationFeed, NotificationItem } from "./types";
import { unreadDigest } from "./unread";

const item = (id: number, read: boolean): NotificationItem => ({
  id,
  module: "twitch",
  kind: "stream_online",
  title: `通知 ${id}`,
  body: "",
  url: null,
  createdAt: "2026-10-08T12:00:00.000Z",
  read,
});

const feed = (recent: NotificationItem[], total: number): NotificationFeed => ({ unread: { total, byModule: { twitch: total } }, recent });

describe("unreadDigest：首頁的未讀通知摘要", () => {
  it("從最近的通知裡挑未讀的，照原本的順序（新的在前）", () => {
    expect(unreadDigest(feed([item(5, false), item(4, true), item(3, false)], 2))).toEqual({ items: [item(5, false), item(3, false)], more: 0 });
  });

  it("最多列 3 則_其餘未讀（包含不在最近幾則裡的）只算數量", () => {
    const recent = [item(9, false), item(8, false), item(7, false), item(6, false)];

    expect(unreadDigest(feed(recent, 12))).toEqual({ items: recent.slice(0, 3), more: 9 });
  });

  it("沒有未讀_空清單", () => {
    expect(unreadDigest(feed([item(1, true)], 0))).toEqual({ items: [], more: 0 });
  });

  it("未讀數比最近幾則裡的未讀還少（剛標成已讀、輪詢還沒回來）_more 不會是負的", () => {
    expect(unreadDigest(feed([item(2, false), item(1, false)], 1)).more).toBe(0);
  });
});
