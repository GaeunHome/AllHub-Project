import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deniedModules, usableModules } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import type { ModuleInfo } from "../module";
import type { NotificationItem } from "./types";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("./cached", () => ({ cachedNotificationCounts: vi.fn(), cachedNotificationList: vi.fn() }));

const cached = mocksOf(await import("./cached"), "cachedNotificationCounts", "cachedNotificationList");
const { NotificationSection } = await import("./notifications-page");
const { UsableNotificationSettings } = await import("./usable-settings");

const MODULES: ModuleInfo[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", description: "", icon: "/icons/brands/twitch.svg" },
  { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg" },
];

const item = (id: number, module: string): NotificationItem => ({ id, module, kind: "demo", title: `${module} 的通知`, body: "", url: null, createdAt: "2026-10-01T00:00:00.000Z", read: false });

const denySavings = () => {
  usableModules.mockImplementation((async (modules: { id: string }[]) => modules.filter((m) => m.id !== "savings")) as typeof usableModules);
  deniedModules.mockResolvedValue(new Set(["savings"]));
};
const section = async (query: Record<string, string> = {}) => renderToStaticMarkup((await NotificationSection({ modules: MODULES, searchParams: Promise.resolve(query) })) as ReactElement);

beforeEach(() => {
  usableModules.mockReset();
  deniedModules.mockReset();
  cached.cachedNotificationCounts.mockReset().mockResolvedValue({ twitch: { total: 1, unread: 1 }, savings: { total: 1, unread: 1 } });
  cached.cachedNotificationList.mockReset().mockResolvedValue([item(2, "savings"), item(1, "twitch")]);
});

describe("通知頁只列能用的模組", () => {
  it("都能用時篩選與清單都有", async () => {
    const markup = await section();

    expect(markup).toContain('href="/notifications?module=twitch"');
    expect(markup).toContain('href="/notifications?module=savings"');
    expect(textOf(markup)).toContain("savings 的通知");
  });

  it("被關掉的模組：篩選按鈕不出現，舊通知也不列", async () => {
    denySavings();

    const markup = await section();

    expect(markup).toContain('href="/notifications?module=twitch"');
    expect(markup).not.toContain('href="/notifications?module=savings"');
    expect(textOf(markup)).not.toContain("savings 的通知");
    expect(textOf(markup)).toContain("twitch 的通知");
  });

  it("網址帶被關掉的模組_當成全部，不依它篩選", async () => {
    denySavings();

    await section({ module: "savings" });

    expect(cached.cachedNotificationList.mock.calls[0][1]).toBeUndefined();
  });

  it("提醒方式只列能用的模組", async () => {
    denySavings();

    const text = textOf(renderToStaticMarkup((await UsableNotificationSettings({ modules: MODULES })) as ReactElement));

    expect(text).toContain("Twitch");
    expect(text).not.toContain("理財");
  });
});
