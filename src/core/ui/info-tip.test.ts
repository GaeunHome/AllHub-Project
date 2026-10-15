import { createElement, isValidElement, useEffect, useId, useLayoutEffect, useReducer, useRef, type ComponentProps, type EffectCallback, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INFO_TIP_CLOSED, InfoTip, infoTipReducer, infoTipVisible, placeInfoTip, type InfoTipEvent, type InfoTipState } from "./info-tip";

// 元件接線的測試直接呼叫元件 狀態與 dispatch 換成替身 effect 收起來自己跑
// 其他測試照 React 原本的實作
vi.mock("react", { spy: true });

const visibleAfter = (...events: InfoTipEvent[]) => infoTipVisible(events.reduce(infoTipReducer, INFO_TIP_CLOSED));

describe("i 圓圈的說明什麼時候顯示", () => {
  it("滑鼠：移上去顯示、移開收起", () => {
    expect(visibleAfter("hover")).toBe(true);
    expect(visibleAfter("hover", "unhover")).toBe(false);
  });

  it("滑鼠：點了就固定顯示，移開也留著；再點一次收起（滑鼠還在上面也一樣），點外面也收起", () => {
    expect(visibleAfter("hover", "toggle", "unhover")).toBe(true);
    expect(visibleAfter("hover", "toggle", "toggle")).toBe(false);
    expect(visibleAfter("hover", "toggle", "unhover", "outside")).toBe(false);
  });

  it("鍵盤：Tab 移到上面顯示、移走收起；Esc 收起，下次移到上面再顯示", () => {
    expect(visibleAfter("focus")).toBe(true);
    expect(visibleAfter("focus", "blur")).toBe(false);
    expect(visibleAfter("focus", "escape")).toBe(false);
    expect(visibleAfter("focus", "escape", "blur", "focus")).toBe(true);
  });

  it("鍵盤：按 Enter 固定顯示後 Tab 到別的地方（焦點移到外面）就收起，不會留在畫面上", () => {
    expect(visibleAfter("focus", "toggle", "blur", "outside")).toBe(false);
  });

  it("點說明框裡的字（按鈕失去焦點，但焦點沒有移到外面的元素）_點開的說明照樣留著，手機上才看得完", () => {
    expect(visibleAfter("toggle", "blur")).toBe(true);
  });

  it("觸控（沒有滑過）：點一下顯示、再點一下收起，點外面也收起", () => {
    expect(visibleAfter("toggle")).toBe(true);
    expect(visibleAfter("toggle", "toggle")).toBe(false);
    expect(visibleAfter("toggle", "toggle", "toggle")).toBe(true);
    expect(visibleAfter("toggle", "outside")).toBe(false);
  });

  it("Esc 連點開的也收起；滑鼠移開再移上去才又顯示", () => {
    expect(visibleAfter("hover", "toggle", "escape")).toBe(false);
    expect(visibleAfter("hover", "toggle", "escape", "unhover", "hover")).toBe(true);
  });

  it("Activity 把頁面藏起來或卸載時回到收起", () => {
    expect(infoTipReducer({ hover: true, focus: true, pinned: true, dismissed: false }, "reset")).toEqual(INFO_TIP_CLOSED);
  });
});

describe("說明框的位置：貼著 i 圓圈，不超出畫面", () => {
  const button = (left: number, top: number) => ({ left, right: left + 36, top, bottom: top + 36 });

  it("下方放得下_置中放在按鈕下方，隔 6px", () => {
    expect(placeInfoTip(button(500, 100), { width: 300, height: 80 }, { width: 1440, height: 900 })).toEqual({ left: 368, top: 142 });
  });

  it("按鈕靠近右緣（手機 390px 寬）_往左移，右邊留 16px，不撐出橫向捲動", () => {
    expect(placeInfoTip(button(330, 100), { width: 320, height: 80 }, { width: 390, height: 844 })).toEqual({ left: 54, top: 142 });
  });

  it("按鈕靠近左緣_往右移，左邊留 16px", () => {
    expect(placeInfoTip(button(10, 100), { width: 200, height: 80 }, { width: 390, height: 844 })).toEqual({ left: 16, top: 142 });
  });

  it("下方放不下_改放上方", () => {
    expect(placeInfoTip(button(500, 800), { width: 300, height: 80 }, { width: 1440, height: 900 })).toEqual({ left: 368, top: 714 });
  });

  it("上下都放不下_還是放下方", () => {
    expect(placeInfoTip(button(500, 40), { width: 300, height: 900 }, { width: 1440, height: 900 })).toEqual({ left: 368, top: 82 });
  });
});

describe("InfoTip 的標記", () => {
  const markup = renderToStaticMarkup(createElement(InfoTip, { label: "關於訂閱方案" } as ComponentProps<typeof InfoTip>, "訂閱方案不包含 API"));
  const button = markup.match(/<button[^>]*>/)![0];
  const tipId = button.match(/aria-describedby="([^"]+)"/)?.[1];
  const tip = tipId ? markup.slice(markup.indexOf(`id="${tipId}"`)) : "";

  it("是 type=button 的按鈕（在表單裡按了不會送出），名稱說明要看什麼，圖示是 i 圓圈", () => {
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-label="關於訂閱方案"');
    expect(markup).toContain("/icons/ui/info.svg");
  });

  it("說明用 aria-describedby 接到按鈕上：報讀器移到按鈕就會念，不必先打開", () => {
    expect(tipId).toBeTruthy();
    expect(tip).toMatch(/^id="[^"]+"[^>]*>訂閱方案不包含 API<\/span>/);
    expect(markup).toMatch(/<span[^>]*role="tooltip"[^>]*>訂閱方案不包含 API<\/span>/);
  });

  it("伺服器算繪時收起；按鈕宣告成彈出層（aria-expanded 加 data-popup-trigger），顯示時頁面自己的快捷鍵會讓開、Esc 只收起說明", () => {
    expect(tip).toMatch(/^[^>]*\shidden=""/);
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain("data-popup-trigger");
  });
});

describe("InfoTip 的接線（滑過、焦點、點外面、Esc、Activity）", () => {
  type Listener = (event: { target?: unknown; key?: string }) => void;
  type Handlers = { ref: { current: unknown }; onPointerEnter: (e: object) => void; onPointerLeave: (e: object) => void; children: ReactElement<{ onFocus: (e: object) => void }>[] };

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const hook of [useReducer, useRef, useId, useLayoutEffect, useEffect]) vi.mocked(hook).mockReset();
  });

  /**
   * 直接呼叫元件 就像算繪到畫面上
   * 回傳外框 span 與 dispatch 的替身 還有收起來的 effect
   */
  function mount(state: InfoTipState) {
    const dispatch = vi.fn();
    const layoutEffects: EffectCallback[] = [];
    const effects: EffectCallback[] = [];
    vi.mocked(useReducer).mockReturnValueOnce([state, dispatch] as never);
    vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
    vi.mocked(useId).mockReturnValue("tip");
    vi.mocked(useLayoutEffect).mockImplementation((effect) => void layoutEffects.push(effect));
    vi.mocked(useEffect).mockImplementation((effect) => void effects.push(effect));
    const root = InfoTip({ label: "關於訂閱方案", children: "訂閱方案不包含 API" });
    if (!isValidElement<Handlers>(root)) throw new Error("InfoTip 要回傳一個元素");
    return { root: root.props, button: root.props.children[0].props, dispatch, layoutEffects, effects };
  }

  const PINNED: InfoTipState = { ...INFO_TIP_CLOSED, pinned: true };

  it("Activity 把頁面藏起來（或卸載）時收起：layout effect 的清除函式送出 reset", () => {
    const { dispatch, layoutEffects } = mount(PINNED);

    const cleanups = layoutEffects.map((effect) => effect());
    expect(dispatch).not.toHaveBeenCalled();
    for (const cleanup of cleanups) cleanup?.();

    expect(dispatch).toHaveBeenCalledWith("reset");
  });

  it("顯示時：按在外框外面、焦點移到外面才收起，按在按鈕或說明框上不算；Esc 收起；收起後拿掉監聽", () => {
    const listeners: { type: string; listener: Listener }[] = [];
    vi.stubGlobal("document", {
      addEventListener: (type: string, listener: Listener) => void listeners.push({ type, listener }),
      removeEventListener: (type: string, listener: Listener) => {
        const index = listeners.findIndex((l) => l.type === type && l.listener === listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    });
    const { root, dispatch, effects } = mount(PINNED);
    const inside = {};
    root.ref.current = { contains: (node: unknown) => node === inside };
    const fire = (type: string, event: { target?: unknown; key?: string }) => listeners.filter((l) => l.type === type).forEach((l) => l.listener(event));

    const cleanups = effects.map((effect) => effect());
    fire("pointerdown", { target: inside });
    fire("focusin", { target: inside });
    fire("keydown", { key: "a" });
    expect(dispatch).not.toHaveBeenCalled();

    fire("pointerdown", { target: {} });
    fire("focusin", { target: {} });
    fire("keydown", { key: "Escape" });
    expect(dispatch.mock.calls).toEqual([["outside"], ["outside"], ["escape"]]);

    for (const cleanup of cleanups) cleanup?.();
    expect(listeners).toEqual([]);
  });

  it("滑過只認滑鼠與觸控筆：手指點下去的 pointerenter／pointerleave 不算（觸控裝置靠點一下切換）", () => {
    const { root, dispatch } = mount(INFO_TIP_CLOSED);

    root.onPointerEnter({ type: "pointerenter", pointerType: "touch" });
    root.onPointerLeave({ type: "pointerleave", pointerType: "touch" });
    expect(dispatch).not.toHaveBeenCalled();

    root.onPointerEnter({ type: "pointerenter", pointerType: "mouse" });
    root.onPointerLeave({ type: "pointerleave", pointerType: "pen" });
    expect(dispatch.mock.calls).toEqual([["hover"], ["unhover"]]);
  });

  it("只有鍵盤移過來的焦點（:focus-visible）才顯示；滑鼠或手指點的、切回視窗時還回來的焦點不算", () => {
    const { button, dispatch } = mount(INFO_TIP_CLOSED);
    const focusEvent = (focusVisible: boolean) => ({ currentTarget: { matches: (selector: string) => selector === ":focus-visible" && focusVisible } });

    button.onFocus(focusEvent(false));
    expect(dispatch).not.toHaveBeenCalled();

    button.onFocus(focusEvent(true));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith("focus");
  });
});
