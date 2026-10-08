import { describe, expect, it, vi } from "vitest";
import { permissionNotice, shouldRequestPermission, shouldShowSystemNotification, showSystemNotification } from "./system-notification";
import type { NotificationItem } from "./types";

const item: NotificationItem = {
  id: 7,
  module: "youtube",
  kind: "new_video",
  title: "뉴진스 發布了新影片",
  body: "새 영상\n沒有中文字幕，用翻譯觀看",
  url: "/youtube/watch/abcdefghijk",
  createdAt: "2026-10-21T12:00:00.000Z",
  read: false,
};

describe("shouldShowSystemNotification", () => {
  const base = { supported: true, permission: "granted" as NotificationPermission, enabled: true, hidden: true };

  it("有權限、設定開著、頁面在背景_才跳系統通知", () => {
    expect(shouldShowSystemNotification(base)).toBe(true);
  });

  it.each([
    ["頁面在前景（右下角提示卡片就夠了）", { hidden: false }],
    ["還沒允許", { permission: "default" as NotificationPermission }],
    ["被封鎖", { permission: "denied" as NotificationPermission }],
    ["設定裡關掉", { enabled: false }],
    ["瀏覽器不支援", { supported: false }],
  ])("%s_不跳", (_name, overrides) => {
    expect(shouldShowSystemNotification({ ...base, ...overrides })).toBe(false);
  });
});

describe("瀏覽器通知的權限（任何一個模組開著瀏覽器通知就要取得權限）", () => {
  it.each([
    ["還沒決定", "default", "request"],
    ["被封鎖", "denied", "denied"],
    ["瀏覽器不支援", "unsupported", "unsupported"],
    ["已允許", "granted", null],
  ] as const)("有模組開著、權限%s（%s）_提示 %s", (_name, permission, notice) => {
    expect(permissionNotice(permission, true)).toBe(notice);
  });

  it("所有模組都關掉瀏覽器通知_不管權限如何都不提示", () => {
    for (const permission of ["default", "denied", "unsupported", "granted"] as const) expect(permissionNotice(permission, false)).toBeNull();
  });

  it("還讀不到權限（伺服器算繪）_先不提示，避免閃一下錯的狀態", () => {
    expect(permissionNotice(null, true)).toBeNull();
  });

  it("打開某個模組的瀏覽器通知時_權限還沒決定才跟瀏覽器要；關掉、已允許或已封鎖都不要", () => {
    expect(shouldRequestPermission("default", true)).toBe(true);
    expect(shouldRequestPermission("default", false)).toBe(false);
    expect(shouldRequestPermission("granted", true)).toBe(false);
    expect(shouldRequestPermission("denied", true)).toBe(false);
    expect(shouldRequestPermission("unsupported", true)).toBe(false);
  });
});

describe("showSystemNotification", () => {
  function fakeNotificationClass() {
    const created: Array<{ title: string; options: NotificationOptions; instance: { onclick: ((event: Event) => void) | null; closed: boolean } }> = [];
    class FakeNotification {
      onclick: ((event: Event) => void) | null = null;
      closed = false;
      constructor(title: string, options: NotificationOptions) {
        created.push({ title, options, instance: this });
      }
      close() {
        this.closed = true;
      }
    }
    return { created, NotificationImpl: FakeNotification as unknown as typeof Notification };
  }

  it("用通知的標題與內容跳出系統通知_同一則用同一個 tag 不重複", () => {
    const { created, NotificationImpl } = fakeNotificationClass();

    showSystemNotification(item, { NotificationImpl, onOpen: vi.fn(), focus: vi.fn() });

    expect(created).toHaveLength(1);
    expect(created[0].title).toBe(item.title);
    expect(created[0].options).toMatchObject({ body: item.body, tag: "allhub-notification-7" });
  });

  it("點系統通知_回到這個分頁、開啟連結、關掉通知", () => {
    const { created, NotificationImpl } = fakeNotificationClass();
    const onOpen = vi.fn();
    const focus = vi.fn();
    showSystemNotification(item, { NotificationImpl, onOpen, focus });
    const preventDefault = vi.fn();

    created[0].instance.onclick!({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith(item);
    expect(created[0].instance.closed).toBe(true);
  });
});
