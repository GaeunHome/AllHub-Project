import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../actions", () => ({ addStreamerAction: vi.fn(), syncSubscriptionsAction: vi.fn(), removeStreamerAction: vi.fn(), setStreamerNotifyAction: vi.fn() }));

const { TwitchPage } = await import("./twitch-page");
const { PageTheme } = await import("@/core/ui/page-theme");

type Props = { className?: string };
const INFO: ModuleInfo = { id: "twitch", name: "Twitch", href: "/twitch", description: "", icon: "/icons/brands/twitch.svg", accent: "violet" };

describe("Twitch 頁的版面", () => {
  it("整頁主題：外框是 PageTheme，深色鋪滿整個畫面（整頁底色由 globals.css 換，導覽列維持全站的樣子）；內容直接放在 AppShell 的外框裡，不再是淺灰頁面上的圓角卡片", () => {
    const page = TwitchPage({ info: INFO }) as ReactElement<Props>;
    const classes = page.props.className!.split(" ");

    expect(page.type).toBe(PageTheme);
    expect(classes).toContain("theme-twitch");
    expect(classes.filter((c) => /rounded|border|^-m|^sm:m-|^(?:sm:|lg:)?p[xytb]?-/.test(c))).toEqual([]);
  });
});
