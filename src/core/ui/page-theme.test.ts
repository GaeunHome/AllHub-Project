import fs from "node:fs";
import { createElement, useLayoutEffect, useRef, type EffectCallback, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// layout effect 只在瀏覽器跑：直接呼叫元件時收起來自己執行
vi.mock("react", { spy: true });

const { ACTIVITY_HIDDEN, PageTheme, markShown } = await import("./page-theme");

afterEach(() => {
  vi.mocked(useLayoutEffect).mockReset();
  vi.mocked(useRef).mockReset();
});

type ThemeProps = Parameters<typeof PageTheme>[0];
const theme = (props: Omit<ThemeProps, "children">, child: ReactNode = createElement("p", null, "頁面")) => createElement(PageTheme, props as ThemeProps, child);

/** 只記錄屬性的假元素 */
function fakeElement(initial: string[] = []) {
  const attributes = new Set(initial);
  return {
    attributes,
    setAttribute: (name: string) => void attributes.add(name),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
}

describe("整頁主題的外框（PageTheme）", () => {
  it("伺服器算繪的 HTML 沒有藏起來的標記：整頁載入時第一次繪製就套用主題（不用等 hydration）", () => {
    const markup = renderToStaticMarkup(theme({ className: "theme-youtube page-stack", accent: "red" }));

    expect(markup).toBe('<div data-accent="red" class="theme-youtube page-stack"><p>頁面</p></div>');
    expect(markup).not.toContain(ACTIVITY_HIDDEN);
  });

  it("顯示時拿掉標記；清除函式（Activity 把頁面藏起來、卸載）標上：主題不會漏到別頁", () => {
    const element = fakeElement([ACTIVITY_HIDDEN]);

    const hide = markShown(element);
    expect(element.attributes.has(ACTIVITY_HIDDEN)).toBe(false);

    hide();
    expect(element.attributes.has(ACTIVITY_HIDDEN)).toBe(true);
  });

  it("外框在 layout effect 裡做這件事：藏起來與顯示都在同一次更新的繪製之前，不會閃一下別的底色", () => {
    const element = fakeElement();
    vi.mocked(useRef).mockReturnValueOnce({ current: element });
    const effects: EffectCallback[] = [];
    vi.mocked(useLayoutEffect).mockImplementation((effect) => {
      effects.push(effect);
    });

    const root = (PageTheme as (props: ThemeProps) => ReactElement)({ className: "theme-youtube", children: null });
    const cleanups = effects.map((effect) => effect());
    for (const cleanup of cleanups) cleanup?.();

    expect((root.props as { ref?: unknown }).ref).toEqual({ current: element });
    expect(element.attributes.has(ACTIVITY_HIDDEN)).toBe(true);
  });
});

describe("會換整頁樣式的 :has()（globals.css）", () => {
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rootHas = [...css.matchAll(/^\s*((?::root|html|body):has\([^{]*?)\s*\{/gm)].map((m) => m[1]);

  it("YouTube 頁換整頁底色與導覽列時排除 Activity 藏起來的頁面", () => {
    expect(rootHas).toContain(`:root:has(.theme-youtube:not([${ACTIVITY_HIDDEN}]))`);
  });

  it("用頁面主題 class 換整頁樣式的選擇器都排除藏起來的頁面（dialog 會在藏起來時關掉、全螢幕會離開，不用排除）", () => {
    const themed = rootHas.filter((selector) => /\.theme-/.test(selector));

    expect(themed.length).toBeGreaterThan(0);
    for (const selector of themed) expect(selector).toContain(`:not([${ACTIVITY_HIDDEN}])`);
  });
});
