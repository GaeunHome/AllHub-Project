import { describe, expect, it } from "vitest";
import { withoutModules } from "../visible";
import type { NotificationFeed, NotificationItem } from "../types";

const item = (id: number, module: string): NotificationItem => ({ id, module, kind: "demo", title: `通知 ${id}`, body: "", url: null, createdAt: "2026-10-01T00:00:00.000Z", read: false });
const FEED: NotificationFeed = { unread: { total: 5, byModule: { twitch: 3, savings: 2 } }, recent: [item(3, "savings"), item(2, "twitch"), item(1, "twitch")] };

describe("關掉的模組看不到：舊通知留在資料庫，讀的時候才濾掉", () => {
  it("未讀數與最近通知都拿掉那個模組", () => {
    expect(withoutModules(FEED, new Set(["savings"]))).toEqual({ unread: { total: 3, byModule: { twitch: 3 } }, recent: [item(2, "twitch"), item(1, "twitch")] });
  });

  it("沒有關掉的模組_原樣回傳", () => {
    expect(withoutModules(FEED, new Set())).toBe(FEED);
  });

  it("全部都關掉_未讀是 0", () => {
    expect(withoutModules(FEED, new Set(["savings", "twitch"]))).toEqual({ unread: { total: 0, byModule: {} }, recent: [] });
  });
});
