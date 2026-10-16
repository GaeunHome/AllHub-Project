import { createElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type EffectCallback, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑 直接呼叫元件 選單的 state 給開著 setter 換成替身
// layout effect 自己跑 跑完再跑清除函式 就是 Activity 把頁面藏起來
vi.mock("react", { spy: true });

const { MoreMenu } = await import("./more-menu");

type Listener = (event: { key?: string; target?: unknown; preventDefault?: () => void }) => void;
let listeners: { type: string; listener: Listener }[] = [];
const target = {
  addEventListener: (type: string, listener: Listener) => void listeners.push({ type, listener }),
  removeEventListener: (type: string, listener: Listener) => {
    listeners = listeners.filter((entry) => entry.type !== type || entry.listener !== listener);
  },
};

beforeEach(() => {
  listeners = [];
  vi.stubGlobal("document", target);
  vi.stubGlobal("window", target);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const hook of [useState, useRef, useId, useLayoutEffect, useEffect]) vi.mocked(hook).mockReset();
});

/** 選單開著時頁面被藏起來 回傳開關選單的 setter */
function hideWhileOpen() {
  const setOpen = vi.fn();
  const layoutEffects: EffectCallback[] = [];
  vi.mocked(useState).mockReturnValueOnce([true, setOpen]);
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
  vi.mocked(useId).mockReturnValue("menu");
  vi.mocked(useLayoutEffect).mockImplementation((effect) => void layoutEffects.push(effect));
  // 點外面 Esc 捲動就收起的監聽要有 document 這裡只看藏起來的當下
  vi.mocked(useEffect).mockImplementation(() => {});

  MoreMenu({ label: "影片的選項", children: null });
  const cleanups = layoutEffects.map((effect) => effect());
  for (const cleanup of cleanups) cleanup?.();
  return setOpen;
}

type Props = { role?: string; type?: string; ref?: { current: unknown }; onClick?: (event: { target: unknown }) => void; children?: ReactNode };

function find(node: ReactNode, match: (props: Props) => boolean): ReactElement<Props> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
  if (!isValidElement<Props>(node)) return undefined;
  return match(node.props) ? node : find(node.props.children, match);
}

/** 只認得標籤名稱與 [屬性="值"] 用逗號分開 跟瀏覽器的 closest 一樣從自己往外找 */
type FakeElement = { tag: string; attributes: Record<string, string>; parent: FakeElement | null; closest(selectors: string): FakeElement | null };
function element(tag: string, attributes: Record<string, string>, parent: FakeElement | null = null): FakeElement {
  const matches = (node: FakeElement, selector: string) => {
    const attribute = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
    return attribute ? node.attributes[attribute[1]] === attribute[2] : node.tag === selector;
  };
  const self: FakeElement = {
    tag,
    attributes,
    parent,
    closest: (selectors) => {
      for (let node: FakeElement | null = self; node; node = node.parent) {
        const current = node;
        if (selectors.split(",").some((selector) => matches(current, selector.trim()))) return current;
      }
      return null;
    },
  };
  return self;
}

/**
 * 選單開著算繪一次 effect 照順序跑完
 * 回傳點面板裡某個位置 按鍵盤 與 ⋮ 按鈕的替身
 */
function renderOpen() {
  const setOpen = vi.fn();
  const effects: EffectCallback[] = [];
  vi.mocked(useState).mockReturnValueOnce([true, setOpen]);
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
  vi.mocked(useId).mockReturnValue("menu");
  vi.mocked(useLayoutEffect).mockImplementation(() => {});
  vi.mocked(useEffect).mockImplementation((effect) => void effects.push(effect));

  const tree = MoreMenu({ label: "「006208 富邦台50」的選項", children: createElement("button", { type: "button", "aria-haspopup": "dialog" }, "買進") });
  const trigger = find(tree, (props) => props.type === "button" && props.role === undefined && props.ref !== undefined)!;
  const panel = find(tree, (props) => props.role === "group")!;
  const button = { focus: vi.fn() };
  trigger.props.ref!.current = button;
  for (const effect of effects) effect();

  const panelElement = element("div", { role: "group" });
  return {
    setOpen,
    button,
    /** 點在面板裡的 target 上 click 會冒泡到面板 */
    click: (inside: (panel: FakeElement) => FakeElement) => panel.props.onClick!({ target: inside(panelElement) }),
    pressKey: (key: string) => {
      const event = { key, preventDefault: vi.fn() };
      for (const { type, listener } of [...listeners]) if (type === "keydown") listener(event);
      return event;
    },
  };
}

describe("⋮ 選單開著時頁面被 Activity 藏起來（換頁、上一頁）", () => {
  it("收起選單：回到這一頁時不會還開著（跟鈴鐺面板、人像選單、i 提示、彈出視窗一樣）", () => {
    expect(hideWhileOpen()).toHaveBeenCalledWith(false);
  });
});

describe("選單裡的項目打開彈出視窗（持股的買進、賣出、修改，頁首的發薪分配）", () => {
  it("點了就收起選單，焦點先回到 ⋮：選單不會留在視窗後面，視窗關掉後焦點回到 ⋮，不掉到 body", () => {
    const menu = renderOpen();

    // 點在項目裡的圖示上也算
    menu.click((panel) => element("svg", {}, element("button", { "aria-haspopup": "dialog" }, panel)));

    expect(menu.setOpen).toHaveBeenCalledWith(false);
    expect(menu.button.focus).toHaveBeenCalledOnce();
  });

  it("點了連結也收起；點了表單的按鈕（上移、停用、刪除）不收起，結果才看得到", () => {
    const link = renderOpen();
    link.click((panel) => element("a", { href: "/savings/settings" }, panel));
    expect(link.setOpen).toHaveBeenCalledWith(false);

    const form = renderOpen();
    form.click((panel) => element("button", { type: "submit" }, element("form", {}, panel)));
    expect(form.setOpen).not.toHaveBeenCalled();
    expect(form.button.focus).not.toHaveBeenCalled();
  });
});

describe("選單開著時按 Esc", () => {
  it("只收起選單：擋下瀏覽器的預設動作，選單在彈出視窗裡（帳戶詳情的持股）時視窗不會跟著關掉；焦點回到 ⋮", () => {
    const menu = renderOpen();

    expect(menu.pressKey("a").preventDefault).not.toHaveBeenCalled();
    const escape = menu.pressKey("Escape");

    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(menu.setOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(menu.button.focus).toHaveBeenCalledOnce();
  });
});
