import { createElement, useState, useSyncExternalStore } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationModule } from "./notification-summary";

// 靜態算繪拿不到瀏覽器裡的狀態：面板開著沒有、通知中心的模組清單、提醒開關與通知權限都換成替身，其他照原本的實作
vi.mock("react", { spy: true });
vi.mock("../ui/header-menus", { spy: true });
vi.mock("./center", { spy: true });
vi.mock("./prefs", { spy: true });

const { useHeaderMenuRoot } = await import("../ui/header-menus");
const { useNotificationCenter } = await import("./center");
const { useAlertPref, useAnyAlertPref } = await import("./prefs");
const { NotificationBell } = await import("./bell");

const MODULES: NotificationModule[] = [
  { id: "twitch", name: "Twitch", icon: "/icons/brands/twitch.svg", accent: "violet" },
  { id: "savings", name: "存錢記帳", icon: "/icons/ui/piggy-bank.svg", accent: "green", notifies: false },
];

/** 面板開著或收起；view 是面板裡的畫面（通知清單或提醒方式） */
function renderBell({ expanded, view = "list" }: { expanded: boolean; view?: "list" | "settings" }) {
  vi.mocked(useHeaderMenuRoot).mockReturnValue({ expanded, toggle: vi.fn(), close: vi.fn(), rootRef: { current: null }, buttonRef: { current: null } });
  vi.mocked(useNotificationCenter).mockReturnValue({
    feed: { unread: { total: 0, byModule: {} }, recent: [] },
    loaded: true,
    latestId: null,
    ringCount: 0,
    modules: new Map(MODULES.map((m) => [m.id, m])),
    open: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  });
  // 面板裡第一個 useState 是畫面的切換
  if (expanded) vi.mocked(useState).mockReturnValueOnce([view, vi.fn()]);
  const markup = renderToStaticMarkup(createElement(NotificationBell));
  return { markup, button: markup.match(/<button[^>]*aria-label="通知[^"]*"[^>]*>/)![0] };
}

afterEach(() => {
  for (const mock of [useHeaderMenuRoot, useNotificationCenter, useAlertPref, useAnyAlertPref, useState, useSyncExternalStore]) vi.mocked(mock).mockReset();
});

describe("鈴鐺按鈕指向的面板（aria-controls）", () => {
  it("收起時面板整個卸載：按鈕不帶 aria-controls，不會指向不存在的元素", () => {
    const { markup, button } = renderBell({ expanded: false });

    expect(button).toContain('aria-expanded="false"');
    expect(button).not.toContain("aria-controls");
    expect(markup).not.toContain('role="dialog"');
  });

  it("展開時指向面板（role=dialog）", () => {
    const { markup, button } = renderBell({ expanded: true });

    const controls = button.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    expect(markup.match(/<div[^>]*role="dialog"[^>]*>/)![0]).toContain(`id="${controls}"`);
  });
});

describe("鈴鐺面板的「提醒方式」：要允許瀏覽器通知的提示", () => {
  /** 只有這些模組開著瀏覽器通知（其他都關了），瀏覽器還沒決定通知權限 */
  function renderSettingsWith(enabled: string[]) {
    vi.mocked(useAlertPref).mockImplementation((id) => enabled.includes(id));
    vi.mocked(useAnyAlertPref).mockImplementation((ids) => ids.some((id) => enabled.includes(id)));
    // 面板裡只有權限的狀態用 useSyncExternalStore（開關的狀態已經換成替身）
    vi.mocked(useSyncExternalStore).mockReturnValueOnce("default");
    return renderBell({ expanded: true, view: "settings" }).markup;
  }

  it("看得到的模組有開著瀏覽器通知：提示還沒允許，附「允許」按鈕", () => {
    const markup = renderSettingsWith(["twitch"]);

    expect(markup).toContain("瀏覽器還沒允許通知");
    expect(markup).toMatch(/<button[^>]*>.*允許<\/button>/);
  });

  it("看得到的瀏覽器通知開關全關了：不提示要允許通知；不發通知的模組（存錢記帳，沒有開關、沿用舊的全域值）開著也不算", () => {
    const markup = renderSettingsWith(["savings"]);

    expect(markup).not.toContain('aria-label="存錢記帳：瀏覽器通知"');
    expect(markup).not.toContain("瀏覽器還沒允許通知");
  });
});
