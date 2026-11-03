import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf, textOf } from "@/dev/test-helpers";
import type { NavModule } from "./nav-links";

vi.mock("../auth", () => ({ requireSession: vi.fn(), usableModules: vi.fn() }));
vi.mock("../auth/actions", () => ({ logout: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const session = mocksOf(await import("../auth"), "requireSession", "usableModules");
const { AppHeader, OwnerMenuLink, SignedInName, UsableNavLinks } = await import("./app-header");

const ALICE = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice" };

const MODULES: NavModule[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", icon: "/icons/brands/twitch.svg" },
  { id: "savings", name: "理財", href: "/savings", icon: "/icons/ui/wallet.svg" },
  { id: "weather", name: "天氣", href: "/", icon: "/icons/ui/cloud-sun.svg", homeOnly: true },
];

beforeEach(() => {
  session.requireSession.mockReset();
  session.usableModules.mockReset();
});

describe("導覽列的帳號選單", () => {
  it("站長_有「管理」，連到 /admin", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, role: "owner" });

    const item = await OwnerMenuLink();

    expect(item?.props).toMatchObject({ href: "/admin", children: "管理" });
  });

  it("一般成員_看不到「管理」", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, role: "member" });

    expect(await OwnerMenuLink()).toBeNull();
  });
});

describe("導覽列的模組", () => {
  it("只列能用的模組，順序照傳進來的；只有首頁卡片的不列", async () => {
    session.usableModules.mockImplementation(async (modules: NavModule[]) => modules.filter((m) => m.id !== "savings"));

    const text = textOf(renderToStaticMarkup((await UsableNavLinks({ modules: MODULES })) as ReactElement));

    expect(text).toContain("Twitch");
    expect(text).not.toContain("理財");
    expect(text).not.toContain("天氣");
  });

  it("還在讀權限時不列出任何模組，被關掉的模組不會先閃一下", () => {
    session.usableModules.mockReturnValue(new Promise(() => {}));

    const text = textOf(renderToStaticMarkup(createElement(AppHeader, { modules: MODULES })));

    expect(text).not.toContain("Twitch");
    expect(text).not.toContain("理財");
  });
});

describe("導覽列的名字", () => {
  it("人像選單顯示暱稱，沒有暱稱時顯示帳號名稱", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, nickname: "小明", role: "member" });
    expect(await SignedInName()).toBe("小明");

    session.requireSession.mockResolvedValue({ ...ALICE, nickname: null, role: "member" });
    expect(await SignedInName()).toBe("alice");
  });
});

describe("導覽列的時鐘", () => {
  it("導覽列照常算繪；時鐘在右上角那一組、鈴鐺左邊，伺服器算繪時是預留的位置", () => {
    // 帳號名稱一直讀不到時顯示骨架 其他部分照樣算繪
    session.requireSession.mockReturnValue(new Promise(() => {}));
    session.usableModules.mockReturnValue(new Promise(() => {}));

    const markup = renderToStaticMarkup(createElement(AppHeader, { modules: [] }));

    const nav = markup.indexOf("</nav>");
    const clock = markup.indexOf(">00:00:00<");
    const bell = markup.indexOf('aria-label="通知"');
    const account = markup.indexOf('aria-label="帳號"');
    expect(nav).toBeGreaterThan(0);
    expect(clock).toBeGreaterThan(nav);
    expect(bell).toBeGreaterThan(clock);
    expect(account).toBeGreaterThan(bell);
  });
});
