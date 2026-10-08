import { describe, expect, it } from "vitest";
import { applyLocalRead, applyLocalReadAll, claimAlerts, freshNotifications, planAlerts, type AlertKind } from "./alerts";
import type { NotificationFeed, NotificationItem } from "./types";

const item = (id: number, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  module: "twitch",
  kind: "test",
  title: `通知 ${id}`,
  body: "",
  url: null,
  createdAt: "2026-10-21T12:00:00.000Z",
  read: false,
  ...overrides,
});

describe("freshNotifications", () => {
  it("第一次載入_不算新通知（打開網站前就有的不提醒）_記下最大的 id", () => {
    expect(freshNotifications([item(3), item(2)], null)).toEqual({ fresh: [], lastSeenId: 3 });
  });

  it("一開始沒有任何通知_之後來的第一則就算新的", () => {
    expect(freshNotifications([], null)).toEqual({ fresh: [], lastSeenId: 0 });
    expect(freshNotifications([item(1)], 0)).toEqual({ fresh: [item(1)], lastSeenId: 1 });
  });

  it("比上次看到的 id 大、而且還沒讀的才算新通知_由舊到新排列", () => {
    const result = freshNotifications([item(6), item(5, { read: true }), item(4), item(3)], 3);

    expect(result.fresh.map((n) => n.id)).toEqual([4, 6]);
    expect(result.lastSeenId).toBe(6);
  });

  it("沒有更新的通知_lastSeenId 不往回退", () => {
    expect(freshNotifications([item(2)], 5)).toEqual({ fresh: [], lastSeenId: 5 });
  });
});

describe("claimAlerts（開了好幾個分頁也只響一次）", () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  }

  it("第一個分頁認領新通知_其他分頁看到同一批就不再提醒", () => {
    const shared = memoryStorage();

    expect(claimAlerts([4, 5], shared)).toEqual([4, 5]);
    expect(claimAlerts([4, 5], shared)).toEqual([]);
    expect(claimAlerts([5, 6], shared)).toEqual([6]);
  });

  it("沒有 localStorage（或被瀏覽器擋下）_照樣提醒", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };

    expect(claimAlerts([1], blocked)).toEqual([1]);
    expect(claimAlerts([1], null)).toEqual([1]);
  });
});

describe("planAlerts（提示音與瀏覽器通知依模組分開設定）", () => {
  /** 沒列出來的模組與種類都是開的（預設全開） */
  const switches =
    (off: Partial<Record<string, AlertKind[]>>) =>
    (module: string, kind: AlertKind): boolean =>
      !off[module]?.includes(kind);
  const twitch = item(1, { module: "twitch" });
  const youtube = item(2, { module: "youtube" });
  const ids = (items: NotificationItem[]) => items.map((n) => n.id);

  it("Twitch 開提示音、YouTube 關提示音_同一批來時照樣響（Twitch 的）", () => {
    const plan = planAlerts([twitch, youtube], new Set([1, 2]), switches({ youtube: ["sound"] }));

    expect(plan.sound).toBe(true);
  });

  it("只有關掉提示音的模組有新通知_不響", () => {
    const plan = planAlerts([youtube], new Set([2]), switches({ youtube: ["sound"] }));

    expect(plan.sound).toBe(false);
  });

  it("系統通知只跳開著瀏覽器通知的模組", () => {
    const plan = planAlerts([twitch, youtube], new Set([1, 2]), switches({ twitch: ["browser"] }));

    expect(ids(plan.system)).toEqual([2]);
  });

  it("兩個都關的模組_只算進未讀數：不跳提示卡片、不響、不跳系統通知", () => {
    const plan = planAlerts([twitch, youtube], new Set([1, 2]), switches({ youtube: ["sound", "browser"] }));

    expect(ids(plan.toasts)).toEqual([1]);
    expect(ids(plan.system)).toEqual([1]);

    const quietOnly = planAlerts([youtube], new Set([2]), switches({ youtube: ["sound", "browser"] }));
    expect(quietOnly).toEqual({ toasts: [], sound: false, system: [] });
  });

  it("只開其中一種的模組_照樣跳提示卡片", () => {
    const soundOnly = planAlerts([youtube], new Set([2]), switches({ youtube: ["browser"] }));
    const browserOnly = planAlerts([youtube], new Set([2]), switches({ youtube: ["sound"] }));

    expect(ids(soundOnly.toasts)).toEqual([2]);
    expect(ids(browserOnly.toasts)).toEqual([2]);
  });

  it("別的分頁已經認領的通知_這個分頁只跳提示卡片，不響也不跳系統通知（多個分頁只響一次）", () => {
    const plan = planAlerts([twitch, youtube], new Set([2]), switches({ youtube: ["sound"] }));

    expect(ids(plan.toasts)).toEqual([1, 2]);
    expect(plan.sound).toBe(false);
    expect(ids(plan.system)).toEqual([2]);
  });
});

describe("先在畫面上標成已讀", () => {
  const feed: NotificationFeed = {
    unread: { total: 3, byModule: { twitch: 2, youtube: 1 } },
    recent: [item(3, { module: "youtube" }), item(2), item(1)],
  };

  it("applyLocalRead_標記指定的通知，未讀數跟著減少", () => {
    const next = applyLocalRead(feed, [2, 3]);

    expect(next.unread).toEqual({ total: 1, byModule: { twitch: 1 } });
    expect(next.recent.map((n) => n.read)).toEqual([true, true, false]);
    expect(feed.recent[0].read).toBe(false);
  });

  it("applyLocalRead_已經讀過的不重複扣", () => {
    const once = applyLocalRead(feed, [2]);

    expect(applyLocalRead(once, [2]).unread).toEqual({ total: 2, byModule: { twitch: 1, youtube: 1 } });
  });

  it("applyLocalReadAll_全部標已讀，也可以只標某個模組", () => {
    expect(applyLocalReadAll(feed).unread).toEqual({ total: 0, byModule: {} });

    const twitchOnly = applyLocalReadAll(feed, "twitch");
    expect(twitchOnly.unread).toEqual({ total: 1, byModule: { youtube: 1 } });
    expect(twitchOnly.recent.map((n) => n.read)).toEqual([false, true, true]);
  });
});
