import fs from "node:fs";
import { createElement, useLayoutEffect, useRef, type EffectCallback, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// layout effect 只在瀏覽器跑 直接呼叫元件時收起來自己執行
vi.mock("react", { spy: true });

const { ACTIVITY_HIDDEN, PageTheme, markShown } = await import("./page-theme");

afterEach(() => {
  vi.mocked(useLayoutEffect).mockReset();
  vi.mocked(useRef).mockReset();
});

type ThemeProps = Parameters<typeof PageTheme>[0];
const theme = (props: Omit<ThemeProps, "children">, child: ReactNode = createElement("p", null, "頁面")) => createElement(PageTheme, props as ThemeProps, child);

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

  describe("Twitch、星穹鐵道：整頁的深色底，導覽列維持全站的樣子", () => {
    // 先拿掉註解 規則前面的註解才不會算進選擇器
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));
    const declarations = (match: (selector: string) => boolean) =>
      rules
        .filter((rule) => rule.selectors.some(match))
        .map((rule) => rule.body)
        .join("\n");
    const shown = (theme: string) => `:root:has(.${theme}:not([${ACTIVITY_HIDDEN}]))`;
    const properties = (body: string) =>
      body
        .split(";")
        .map((declaration) => declaration.split(":")[0].trim())
        .filter(Boolean);

    for (const [theme, base] of [
      ["theme-twitch", "#0e0e10"],
      ["theme-starrail", "#090d26"],
    ]) {
      it(`${theme}：頁面顯示時 body 換成這一頁的底色（導覽列以下鋪滿全寬、整個高度），一樣排除 Activity 藏起來的頁面`, () => {
        expect(declarations((s) => s === `${shown(theme)} body`)).toMatch(new RegExp(`background-color:\\s*${base}`));
      });

      it(`${theme}：:root、html、body 只換整頁的背景（與星空的變數），不換導覽列、鈴鐺面板、人像選單用的變數（文字、面、主色、模組圖示、導覽列底色）與 color-scheme`, () => {
        // 選擇器是 :root html body 或其中的 body 時 導覽列是它們的子孫
        // 在這裡設的變數都會被導覽列繼承
        const page = declarations((s) => s.includes(`.${theme}`) && /^(?::root|html|body):has\(.*\)(?:\s+body)?$/.test(s));

        expect(page).not.toBe("");
        expect(properties(page).filter((p) => !/^(?:background(?:-[\w-]+)?|--sr-sky(?:-size)?)$/.test(p))).toEqual([]);
      });

      it(`${theme}：調色盤只放在頁面的外框上，連同深色模式的模組圖示色與狀態點：外觀選淺色時，頁面裡的圖示與標籤也不會變暗`, () => {
        const frame = declarations((s) => s === `.${theme}`);

        expect(frame).toMatch(/color-scheme:\s*dark/);
        expect(frame).toMatch(/--ink:/);
        expect(frame).toMatch(/--surface:/);
        expect(frame).toMatch(/--accent-gold:\s*#fbbf24/);
        expect(frame).toMatch(/--success-dot:\s*#34d399/);
      });

      it(`${theme}：導覽列直接疊在深色底上會被染灰，改成不透明、跟別頁一樣的顏色（全站的 --header-bg 疊在 --bg-base 上）`, () => {
        const header = declarations((s) => s === `${shown(theme)} .app-header`);

        expect(header).toMatch(/background-color:\s*var\(--bg-base\)/);
        expect(header).toMatch(/background-image:\s*linear-gradient\(var\(--header-bg\),\s*var\(--header-bg\)\)/);
      });
    }
  });

  it("用頁面主題 class 換整頁樣式的選擇器都排除藏起來的頁面（dialog 會在藏起來時關掉、全螢幕會離開，不用排除）", () => {
    const themed = rootHas.filter((selector) => /\.theme-/.test(selector));

    expect(themed.length).toBeGreaterThan(0);
    for (const selector of themed) expect(selector).toContain(`:not([${ACTIVITY_HIDDEN}])`);
  });
});
