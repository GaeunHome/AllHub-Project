import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("../auth", () => ({ requireSession: vi.fn() }));
vi.mock("../auth/actions", () => ({ logout: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const session = mocksOf(await import("../auth"), "requireSession");
const { AppHeader, OwnerMenuLink } = await import("./app-header");

const ALICE = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice" };

beforeEach(() => {
  session.requireSession.mockReset();
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

describe("導覽列的時鐘", () => {
  it("導覽列照常算繪；時鐘在右上角那一組、鈴鐺左邊，伺服器算繪時是預留的位置", () => {
    // 帳號名稱一直讀不到時顯示骨架 其他部分照樣算繪
    session.requireSession.mockReturnValue(new Promise(() => {}));

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
