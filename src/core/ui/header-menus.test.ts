import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, use, useCallback, useEffect, useId, useRef, type EffectCallback, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑：直接呼叫元件，開關的 context 換成替身、effect 收起來自己跑，document 換成記下監聽的替身
vi.mock("react", { spy: true });
vi.mock("../auth/actions", () => ({ logout: vi.fn() }));
vi.mock("./theme-sync", () => ({ useThemePref: () => ["system", vi.fn()] }));

const { AccountMenu, AccountMenuLink } = await import("./account-menu");

type Listener = (event: { target?: unknown; key?: string }) => void;
type LinkProps = Parameters<typeof AccountMenuLink>[0];
type ItemProps = { role: string; href?: string; onClick?: () => void; children?: ReactNode };

/** 人像選單開著（HeaderMenus 的 context）；close 收到的是要收起的面板 */
const menus = { open: "account", toggle: vi.fn(), close: vi.fn() };
let listeners: { type: string; listener: Listener }[] = [];

const press = (target: unknown) => {
  for (const { type, listener } of [...listeners]) if (type === "pointerdown") listener({ target });
};

const pressKey = (key: string) => {
  for (const { type, listener } of [...listeners]) if (type === "keydown") listener({ key });
};

/** 依序呼叫元件（含選單裡的每個 AccountMenuLink）並跑完 effect，就像選單開著時算繪到畫面上；外框包住按鈕與整個選單 */
function renderOpenMenu() {
  const effects: EffectCallback[] = [];
  vi.mocked(useEffect).mockImplementation((effect) => void effects.push(effect));
  const tree = AccountMenu({ username: "owner", ownerItems: createElement(AccountMenuLink, { href: "/admin", icon: "shield-check" } as LinkProps, "管理") });
  const items: ReactElement<ItemProps>[] = [];
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isValidElement<ItemProps>(node)) return;
    if (node.type === AccountMenuLink) return visit(AccountMenuLink(node.props as unknown as LinkProps));
    if (node.props.role === "menuitem" || node.props.role === "menuitemradio") items.push(node);
    visit(node.props.children);
  };
  visit(tree);
  const inside = new Set<unknown>(items);
  (tree.props as { ref: { current: unknown } }).ref.current = { contains: (node: unknown) => inside.has(node) };
  // 人像按鈕（外框的第一個子元素）：Esc 收起後焦點要回到這裡
  const button = { focus: vi.fn() };
  const [trigger] = (tree.props as { children: ReactElement<{ ref: { current: unknown } }>[] }).children;
  trigger.props.ref.current = button;
  for (const effect of effects) effect();
  return { items, links: items.filter((item) => item.props.href), button };
}

beforeEach(() => {
  listeners = [];
  vi.stubGlobal("document", {
    addEventListener: (type: string, listener: Listener) => void listeners.push({ type, listener }),
    removeEventListener: (type: string, listener: Listener) => {
      listeners = listeners.filter((entry) => entry.type !== type || entry.listener !== listener);
    },
  });
  let ids = 0;
  vi.mocked(use).mockReturnValue(menus as never);
  vi.mocked(useCallback).mockImplementation(((callback: unknown) => callback) as never);
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
  vi.mocked(useId).mockImplementation(() => `id-${++ids}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  menus.close.mockReset();
  for (const hook of [use, useCallback, useRef, useId, useEffect]) vi.mocked(hook).mockReset();
});

describe("人像選單開著時按下滑鼠或手指（pointerdown）", () => {
  it("按在選單裡的項目上不收起：選單要留到 click，外觀、「管理」「帳號設定」與登出才點得到", () => {
    const { items, links } = renderOpenMenu();
    expect(items.map((item) => item.props.role)).toEqual(["menuitemradio", "menuitemradio", "menuitemradio", "menuitem", "menuitem", "menuitem"]);
    expect(links.map((link) => link.props.href)).toEqual(["/admin", "/account"]);

    for (const item of items) press(item);

    expect(menus.close).not.toHaveBeenCalled();
  });

  it("按在選單外面才收起，而且只收一次", () => {
    renderOpenMenu();

    press({});

    expect(menus.close).toHaveBeenCalledExactlyOnceWith("account");
  });

  it("點了選單裡的連結才收起（點同一頁時不會換頁，換頁時也會收）", () => {
    const { links } = renderOpenMenu();

    links[1].props.onClick?.();

    expect(menus.close).toHaveBeenCalledExactlyOnceWith("account");
  });
});

describe("人像選單開著時按鍵盤", () => {
  it("Esc 收起一次，焦點回到人像按鈕（鍵盤使用者不會掉到頁首）；其他按鍵不收起", () => {
    const { button } = renderOpenMenu();

    pressKey("a");
    expect(menus.close).not.toHaveBeenCalled();

    pressKey("Escape");

    expect(menus.close).toHaveBeenCalledExactlyOnceWith("account");
    expect(button.focus).toHaveBeenCalledOnce();
  });
});

describe("導覽列面板「點外面就收起」的監聽只掛在外框上", () => {
  const SRC = fileURLToPath(new URL("../..", import.meta.url));
  const sources = (fs.readdirSync(SRC, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({ file: file.split(path.sep).join("/"), source: fs.readFileSync(path.join(SRC, file), "utf8") }));

  it("每個面板只有一個元件呼叫 useHeaderMenuRoot，而且把 rootRef 接在包住按鈕與面板的外框上；面板裡的項目只用 useHeaderMenu（拿到的 ref 沒接上任何元素，按哪裡都算外面）", () => {
    const owners = new Map<string, string[]>();
    for (const { file, source } of sources) {
      for (const [, id] of source.matchAll(/useHeaderMenuRoot\(\s*"([^"]+)"\s*\)/g)) {
        owners.set(id, [...(owners.get(id) ?? []), file]);
        expect(source, file).toContain("ref={rootRef}");
      }
    }

    expect([...owners.keys()].sort()).toEqual(["account", "notifications"]);
    for (const [id, files] of owners) expect(files, id).toHaveLength(1);
  });
});
