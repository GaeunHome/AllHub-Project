import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UnreadDigestList } from "./home-notifications";
import type { NotificationModule } from "./notification-summary";
import type { NotificationItem } from "./types";

const NOW = new Date("2026-10-08T12:00:00Z");
const MODULES = new Map<string, NotificationModule>([["twitch", { id: "twitch", name: "Twitch", icon: "/icons/brands/twitch.svg", accent: "violet" }]]);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

const item = (id: number, title: string, minutesAgo: number): NotificationItem => ({
  id,
  module: "twitch",
  kind: "stream_online",
  title,
  body: "今天玩鐵道",
  url: "https://twitch.tv/alice",
  createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  read: false,
});

const render = (props: Partial<Parameters<typeof UnreadDigestList>[0]>) =>
  renderToStaticMarkup(createElement(UnreadDigestList, { loaded: true, items: [], more: 0, modules: MODULES, now: NOW, onOpen: vi.fn(), ...props }));

describe("首頁的未讀通知摘要", () => {
  it("還沒抓到第一次的通知_顯示載入中，不先說沒有未讀", () => {
    const markup = render({ loaded: false });

    expect(markup).toContain('aria-busy="true"');
    expect(textOf(markup)).not.toContain("沒有未讀通知");
  });

  it("沒有未讀_一行說明就好", () => {
    expect(textOf(render({}))).toContain("沒有未讀通知");
  });

  it("列出未讀的標題、模組與多久以前；每則都是按鈕（點了標成已讀並打開連結）", () => {
    const markup = render({ items: [item(2, "ALICE 開台了", 5), item(1, "BOB 開台了", 125)] });
    const text = textOf(markup);

    expect(text).toContain("ALICE 開台了");
    expect(text).toContain("BOB 開台了");
    expect(text).toContain("Twitch");
    expect(text).toContain("5 分鐘前");
    expect(text).toContain("2 小時前");
    expect(markup.match(/<button[^>]*type="button"/g)).toHaveLength(2);
    expect(text).not.toContain("還有");
  });

  it("還有更多未讀_顯示數量，連到通知頁", () => {
    const markup = render({ items: [item(3, "ALICE 開台了", 1)], more: 9 });

    expect(textOf(markup)).toContain("還有 9 則未讀");
    expect(markup).toContain('href="/notifications"');
  });
});
